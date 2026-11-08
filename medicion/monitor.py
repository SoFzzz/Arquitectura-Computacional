"""Monitor de recursos, una fila por segundo, en CSV.

Modo local  (maquina fisica o VM en la nube): mide el proceso java con psutil.
Modo docker: mide el contenedor leyendo sus cgroups (cpu.stat, memory.stat,
             io.stat, /proc/net/dev) con `docker exec`, y el host con psutil.

Columnas:
  t_s, cpu_total_pct, cpu_user_pct, cpu_sys_pct, cpu_iowait_pct, core_0..core_N (pct),
  app_cpu_nucleos (nucleos usados por la app: 1.0 = un nucleo completo),
  app_rss_mb (memoria residente real), app_hilos,
  disco_r_iops, disco_w_iops, disco_r_mbs, disco_w_mbs  (dispositivo que usa la app),
  red_rx_kbs, red_tx_kbs (interfaces del sistema / del contenedor),
  gen_cpu_nucleos (CPU del generador de carga, para descontarlo),
  ram_usada_mb

Uso:
  python monitor.py --modo local  --pid 1234 --salida sistema.csv [--gen-pid 999]
  python monitor.py --modo docker --contenedor petclinic --salida sistema.csv
"""
import argparse
import csv
import os
import re
import signal
import subprocess
import sys
import time

import psutil

detener = False


def _parar(*_):
    global detener
    detener = True


signal.signal(signal.SIGTERM, _parar)
signal.signal(signal.SIGINT, _parar)
if hasattr(signal, "SIGBREAK"):
    signal.signal(signal.SIGBREAK, _parar)


def leer_cgroup(contenedor):
    """Lee contadores acumulados del contenedor (cgroup v2)."""
    cmd = ["docker", "exec", contenedor, "sh", "-c",
           "cat /sys/fs/cgroup/cpu.stat; echo ===; cat /sys/fs/cgroup/memory.stat; echo ===;"
           "cat /sys/fs/cgroup/io.stat; echo ===; cat /proc/net/dev; echo ===;"
           "ls /proc/1/task | wc -l"]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout
    partes = out.split("===")
    r = {}
    for linea in partes[0].splitlines():
        k, _, v = linea.partition(" ")
        if k == "usage_usec":
            r["cpu_usec"] = int(v)
    mem = dict(l.split() for l in partes[1].splitlines() if len(l.split()) == 2)
    r["anon"] = int(mem.get("anon", 0))
    r["file"] = int(mem.get("file", 0))
    rb = wb = rio = wio = 0
    for linea in partes[2].splitlines():
        campos = dict(re.findall(r"(\w+)=(\d+)", linea))
        rb += int(campos.get("rbytes", 0)); wb += int(campos.get("wbytes", 0))
        rio += int(campos.get("rios", 0)); wio += int(campos.get("wios", 0))
    r.update(rbytes=rb, wbytes=wb, rios=rio, wios=wio)
    rx = tx = 0
    for linea in partes[3].splitlines():
        if ":" in linea and "lo:" not in linea:
            nums = linea.split(":", 1)[1].split()
            rx += int(nums[0]); tx += int(nums[8])
    r.update(rx=rx, tx=tx)
    try:
        r["hilos"] = int(partes[4].strip())
    except ValueError:
        r["hilos"] = 0
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modo", choices=["local", "docker"], required=True)
    ap.add_argument("--pid", type=int, help="PID del proceso java (modo local)")
    ap.add_argument("--contenedor", help="nombre del contenedor (modo docker)")
    ap.add_argument("--gen-pid", type=int, default=None, help="PID del generador de carga")
    ap.add_argument("--salida", required=True)
    ap.add_argument("--intervalo", type=float, default=1.0)
    ap.add_argument("--duracion", type=float, default=0, help="0 = hasta recibir senal")
    a = ap.parse_args()

    ncores = psutil.cpu_count(logical=True)
    app = psutil.Process(a.pid) if a.modo == "local" else None
    gen = None
    if a.gen_pid:
        try:
            gen = psutil.Process(a.gen_pid)
            gen.cpu_percent(None)
        except psutil.Error:
            gen = None
    if app:
        app.cpu_percent(None)

    psutil.cpu_percent(None, percpu=True)
    psutil.cpu_times_percent(None)
    disco_prev = psutil.disk_io_counters()
    red_prev = psutil.net_io_counters()
    cg_prev = leer_cgroup(a.contenedor) if a.modo == "docker" else None
    t_prev = time.perf_counter()
    t0 = t_prev

    cab = ["t_s", "cpu_total_pct", "cpu_user_pct", "cpu_sys_pct", "cpu_iowait_pct"] + \
          [f"core_{i}" for i in range(ncores)] + \
          ["app_cpu_nucleos", "app_rss_mb", "app_hilos",
           "disco_r_iops", "disco_w_iops", "disco_r_mbs", "disco_w_mbs",
           "red_rx_kbs", "red_tx_kbs", "gen_cpu_nucleos", "ram_usada_mb"]

    with open(a.salida, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cab)
        f.flush()
        while not detener:
            time.sleep(a.intervalo)
            ahora = time.perf_counter()
            dt = ahora - t_prev
            t_prev = ahora
            cores = psutil.cpu_percent(None, percpu=True)
            tp = psutil.cpu_times_percent(None)
            total = round(sum(cores) / len(cores), 2)
            iowait = getattr(tp, "iowait", 0.0)
            vm = psutil.virtual_memory()

            if a.modo == "local":
                try:
                    app_cpu = app.cpu_percent(None) / 100
                    app_rss = app.memory_info().rss / 2**20
                    hilos = app.num_threads()
                except psutil.Error:
                    break
                d = psutil.disk_io_counters()
                r_iops = (d.read_count - disco_prev.read_count) / dt
                w_iops = (d.write_count - disco_prev.write_count) / dt
                r_mbs = (d.read_bytes - disco_prev.read_bytes) / dt / 2**20
                w_mbs = (d.write_bytes - disco_prev.write_bytes) / dt / 2**20
                disco_prev = d
                n = psutil.net_io_counters()
                rx = (n.bytes_recv - red_prev.bytes_recv) / dt / 1024
                tx = (n.bytes_sent - red_prev.bytes_sent) / dt / 1024
                red_prev = n
            else:
                try:
                    cg = leer_cgroup(a.contenedor)
                except Exception:
                    break
                app_cpu = (cg["cpu_usec"] - cg_prev["cpu_usec"]) / 1e6 / dt
                app_rss = cg["anon"] / 2**20
                hilos = cg["hilos"]
                r_iops = (cg["rios"] - cg_prev["rios"]) / dt
                w_iops = (cg["wios"] - cg_prev["wios"]) / dt
                r_mbs = (cg["rbytes"] - cg_prev["rbytes"]) / dt / 2**20
                w_mbs = (cg["wbytes"] - cg_prev["wbytes"]) / dt / 2**20
                rx = (cg["rx"] - cg_prev["rx"]) / dt / 1024
                tx = (cg["tx"] - cg_prev["tx"]) / dt / 1024
                cg_prev = cg

            gen_cpu = 0.0
            if gen:
                try:
                    gen_cpu = gen.cpu_percent(None) / 100
                except psutil.Error:
                    gen = None

            fila = [round(ahora - t0, 2), total, round(tp.user, 2), round(tp.system, 2), round(iowait, 2)] + \
                   [round(c, 1) for c in cores] + \
                   [round(app_cpu, 3), round(app_rss, 1), hilos,
                    round(r_iops, 1), round(w_iops, 1), round(r_mbs, 3), round(w_mbs, 3),
                    round(rx, 1), round(tx, 1), round(gen_cpu, 3), round(vm.used / 2**20)]
            w.writerow(fila)
            f.flush()
            if a.duracion and ahora - t0 >= a.duracion:
                break


if __name__ == "__main__":
    main()
