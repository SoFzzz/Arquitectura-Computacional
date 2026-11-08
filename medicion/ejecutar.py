"""Protocolo de medicion completo para UN entorno. Mismo protocolo en los tres.

Fases:
  0. arranque     : lanza la app y mide el tiempo hasta el primer HTTP 200
  1. reposo       : 30 s sin carga (linea base)
  2. calentamiento: 60 s de carga (JIT de la JVM, caches); no cuenta
  3. sostenida    : N repeticiones de D segundos con V usuarios virtuales
  4. escalado     : escalones de concurrencia (5, 10, 20, 40, 80, 120 VUs)
                    para ver que se rompe primero al subir la carga

Cada fase guarda en resultados/<entorno>/<fase>/:
  peticiones.csv (crudo por peticion), sistema.csv (crudo por segundo), resumen.json

Ejemplos:
  python ejecutar.py --modo local  --entorno fisica-local --jar ../spring-petclinic/target/spring-petclinic-4.0.0-SNAPSHOT.jar
  python ejecutar.py --modo docker --entorno contenedor-2cpu-1g --cpus 2 --memoria 1g --imagen petclinic-bench
  python ejecutar.py --modo local  --entorno aws-t3-medium --jar spring-petclinic.jar --precio-hora 0.0416
"""
import argparse
import datetime as dt
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
import urllib.request

import psutil

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)


def log(msg):
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def esperar_http(url, limite=240):
    t0 = time.perf_counter()
    while time.perf_counter() - t0 < limite:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return time.perf_counter() - t0
        except Exception:
            pass
        time.sleep(0.1)
    raise RuntimeError("La aplicacion no respondio a tiempo")


def pid_escuchando(url, respaldo):
    """PID real de la JVM: el que escucha en el puerto. En Windows `java` del PATH
    puede ser un lanzador que abre otro proceso, asi que no sirve proc.pid."""
    puerto = int(url.rsplit(":", 1)[1].split("/")[0]) if url.count(":") > 1 else 80
    try:
        for c in psutil.net_connections(kind="tcp"):
            if c.status == psutil.CONN_LISTEN and c.laddr and c.laddr.port == puerto and c.pid:
                return c.pid
    except psutil.Error:
        pass
    hijos = psutil.Process(respaldo).children(recursive=True)
    java = [h for h in hijos if "java" in h.name().lower()]
    return max(java, key=lambda h: h.memory_info().rss).pid if java else respaldo


def puerto_libre(url):
    try:
        urllib.request.urlopen(url, timeout=1)
        return False
    except Exception:
        return True


def ficha_tecnica(args):
    f = {
        "entorno": args.entorno,
        "modo": args.modo,
        "fecha": dt.datetime.now().isoformat(timespec="seconds"),
        "so": f"{platform.system()} {platform.release()} ({platform.version()})",
        "arquitectura": platform.machine(),
        "nucleos_logicos": psutil.cpu_count(logical=True),
        "nucleos_fisicos": psutil.cpu_count(logical=False),
        "ram_total_gb": round(psutil.virtual_memory().total / 2**30, 1),
        "python": platform.python_version(),
    }
    cpu = platform.processor()
    try:
        if platform.system() == "Linux":
            with open("/proc/cpuinfo") as fh:
                m = re.search(r"model name\s*:\s*(.+)", fh.read())
                cpu = m.group(1) if m else cpu
        elif platform.system() == "Windows":
            cpu = subprocess.run(["powershell", "-NoProfile", "-Command",
                                  "(Get-CimInstance Win32_Processor).Name"],
                                 capture_output=True, text=True).stdout.strip() or cpu
            f["disco"] = subprocess.run(["powershell", "-NoProfile", "-Command",
                                         "(Get-PhysicalDisk | Select-Object -First 1 | ForEach-Object { $_.FriendlyName + ' (' + $_.MediaType + ')' })"],
                                        capture_output=True, text=True).stdout.strip()
    except Exception:
        pass
    f["cpu"] = cpu
    try:
        jv = subprocess.run(["java", "-version"], capture_output=True, text=True)
        f["java_host"] = (jv.stderr or jv.stdout).splitlines()[0]
    except Exception:
        pass
    if args.modo == "docker":
        f["limite_cpus"] = args.cpus
        f["limite_memoria"] = args.memoria
        f["imagen"] = args.imagen
        try:
            info = subprocess.run(["docker", "info", "--format",
                                   "{{.OperatingSystem}} | kernel {{.KernelVersion}} | {{.NCPU}} CPU | {{.MemTotal}} B"],
                                  capture_output=True, text=True).stdout.strip()
            f["docker_host"] = info
        except Exception:
            pass
    if args.precio_hora is not None:
        f["precio_hora_usd"] = args.precio_hora
    if args.nota:
        f["nota"] = args.nota
    return f


def lanzar_app(args, carpeta):
    url = args.url + "/"
    if not puerto_libre(url):
        raise RuntimeError(f"Ya hay algo respondiendo en {args.url}. Detenlo antes de medir.")
    log_app = open(os.path.join(carpeta, "app.log"), "w", encoding="utf-8", errors="replace")
    t0 = time.perf_counter()
    if args.modo == "local":
        cmd = ["java"] + (args.java_opts.split() if args.java_opts else []) + ["-jar", args.jar]
        proc = subprocess.Popen(cmd, stdout=log_app, stderr=subprocess.STDOUT)
        segundos = esperar_http(url)
        return {"proc": proc, "pid": pid_escuchando(args.url, proc.pid), "arranque_s": round(segundos, 2), "t0": t0}
    subprocess.run(["docker", "rm", "-f", args.contenedor], capture_output=True)
    cmd = ["docker", "run", "-d", "--name", args.contenedor, "-p", "8080:8080",
           f"--cpus={args.cpus}", f"--memory={args.memoria}", f"--memory-swap={args.memoria}"]
    if args.java_opts:
        cmd += ["-e", f"JAVA_TOOL_OPTIONS={args.java_opts}"]
    cmd.append(args.imagen)
    subprocess.run(cmd, check=True, capture_output=True)
    segundos = esperar_http(url)
    return {"proc": None, "pid": None, "arranque_s": round(segundos, 2), "t0": t0}


def detener_app(args, app, carpeta):
    if args.modo == "local":
        try:
            if app["pid"] != app["proc"].pid:
                psutil.Process(app["pid"]).terminate()
        except psutil.Error:
            pass
        app["proc"].terminate()
        try:
            app["proc"].wait(20)
        except subprocess.TimeoutExpired:
            app["proc"].kill()
    else:
        logs = subprocess.run(["docker", "logs", args.contenedor], capture_output=True, text=True)
        with open(os.path.join(carpeta, "app.log"), "w", encoding="utf-8") as fh:
            fh.write(logs.stdout + logs.stderr)
        subprocess.run(["docker", "rm", "-f", args.contenedor], capture_output=True)


def fase(args, app, nombre, vus, duracion):
    carpeta = os.path.join(args.base, nombre)
    os.makedirs(carpeta, exist_ok=True)
    py = sys.executable
    carga = None
    if vus > 0:
        carga = subprocess.Popen([py, os.path.join(AQUI, "carga.py"), "--url", args.url, "--vus", str(vus),
                                  "--duracion", str(duracion), "--pausa", str(args.pausa),
                                  "--salida", os.path.join(carpeta, "peticiones.csv"),
                                  "--resumen", os.path.join(carpeta, "carga.json")],
                                 stdout=subprocess.DEVNULL)
    mon_cmd = [py, os.path.join(AQUI, "monitor.py"), "--modo", args.modo, "--salida",
               os.path.join(carpeta, "sistema.csv"), "--duracion", str(duracion)]
    mon_cmd += ["--pid", str(app["pid"])] if args.modo == "local" else ["--contenedor", args.contenedor]
    if carga:
        mon_cmd += ["--gen-pid", str(carga.pid)]
    mon = subprocess.Popen(mon_cmd)
    if carga:
        carga.wait()
    mon.wait(duracion + 30)
    resumen = {"fase": nombre, "vus": vus, "duracion_s": duracion}
    p = os.path.join(carpeta, "carga.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as fh:
            resumen.update(json.load(fh))
    with open(os.path.join(carpeta, "resumen.json"), "w", encoding="utf-8") as fh:
        json.dump(resumen, fh, indent=2)
    if vus:
        log(f"  {nombre}: {resumen.get('rps')} req/s  p50={resumen.get('p50_ms')}  "
            f"p95={resumen.get('p95_ms')}  p99={resumen.get('p99_ms')} ms  errores={resumen.get('errores')}")
    return resumen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modo", choices=["local", "docker"], required=True)
    ap.add_argument("--entorno", required=True, help="nombre corto, p.ej. fisica-local")
    ap.add_argument("--jar", help="ruta del .jar (modo local)")
    ap.add_argument("--imagen", default="petclinic-bench")
    ap.add_argument("--contenedor", default="petclinic-bench")
    ap.add_argument("--cpus", default="2")
    ap.add_argument("--memoria", default="1g")
    ap.add_argument("--java-opts", default="")
    ap.add_argument("--url", default="http://localhost:8080")
    ap.add_argument("--vus", type=int, default=30)
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--duracion", type=int, default=300)
    ap.add_argument("--pausa", type=float, default=0.05)
    ap.add_argument("--escalado", default="5,10,20,40,80,120")
    ap.add_argument("--dur-escalado", type=int, default=45)
    ap.add_argument("--precio-hora", type=float, default=None)
    ap.add_argument("--nota", default="")
    ap.add_argument("--salida", default=os.path.join(AQUI, "resultados"))
    args = ap.parse_args()

    args.base = os.path.join(args.salida, args.entorno)
    if os.path.exists(args.base):
        viejo = args.base + "_" + dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        shutil.move(args.base, viejo)
        log(f"Resultados anteriores movidos a {viejo}")
    os.makedirs(args.base)

    ficha = ficha_tecnica(args)
    log(f"Entorno {args.entorno}: {ficha.get('cpu')} | {ficha['nucleos_logicos']} hilos | {ficha['ram_total_gb']} GB")
    log("Fase 0: arranque")
    app = lanzar_app(args, args.base)
    ficha["arranque_s"] = app["arranque_s"]
    ficha["protocolo"] = {"vus": args.vus, "reps": args.reps, "duracion_s": args.duracion, "pausa_s": args.pausa,
                          "escalado": [int(x) for x in args.escalado.split(",") if x],
                          "dur_escalado_s": args.dur_escalado, "reposo_s": 30, "calentamiento_s": 60,
                          "generador": "carga.py (mismo host que la app)"}
    log(f"  arranco en {app['arranque_s']} s")
    try:
        log("Fase 1: reposo 30 s")
        fase(args, app, "reposo", 0, 30)
        log("Fase 2: calentamiento 60 s")
        fase(args, app, "calentamiento", args.vus, 60)
        for i in range(1, args.reps + 1):
            time.sleep(10)
            log(f"Fase 3: sostenida rep {i}/{args.reps} ({args.vus} VUs, {args.duracion} s)")
            fase(args, app, f"sostenida_{i}", args.vus, args.duracion)
        for v in ficha["protocolo"]["escalado"]:
            time.sleep(5)
            log(f"Fase 4: escalado {v} VUs ({args.dur_escalado} s)")
            fase(args, app, f"escalado_{v:03d}", v, args.dur_escalado)
    finally:
        detener_app(args, app, args.base)
        logp = os.path.join(args.base, "app.log")
        if os.path.exists(logp):
            with open(logp, encoding="utf-8", errors="replace") as fh:
                m = re.search(r"Started \w+ in ([\d.]+) seconds", fh.read())
                if m:
                    ficha["arranque_spring_s"] = float(m.group(1))
        with open(os.path.join(args.base, "entorno.json"), "w", encoding="utf-8") as fh:
            json.dump(ficha, fh, indent=2, ensure_ascii=False)
    log(f"Listo. Resultados en {args.base}")


if __name__ == "__main__":
    main()
