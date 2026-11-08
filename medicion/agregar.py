"""Convierte los datos crudos de resultados/<entorno>/ en tablero/datos.js.

Toma la MEDIANA de las repeticiones sostenidas (no el promedio), y para la
"repeticion en vivo" del tablero usa la repeticion cuya tasa (req/s) es la mediana.

Uso:  python agregar.py   (lee config_entornos.json y resultados/*)
"""
import csv
import glob
import json
import math
import os
import statistics as st
from collections import defaultdict

AQUI = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(AQUI, "resultados")
SALIDA = os.path.join(AQUI, "..", "docs", "datos.js")


def pct(orden, p):
    if not orden:
        return None
    k = (len(orden) - 1) * p / 100
    f = int(k)
    c = min(f + 1, len(orden) - 1)
    return orden[f] + (orden[c] - orden[f]) * (k - f)


def r(x, n=2):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(x, n)


def leer_csv(ruta):
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def stats_sistema(filas, ncores_limite):
    """Resume sistema.csv. Ignora el primer segundo (arranque del monitor)."""
    filas = filas[1:] if len(filas) > 2 else filas
    if not filas:
        return {}
    cols_core = [c for c in filas[0] if c.startswith("core_")]
    col = lambda c: [float(f[c]) for f in filas if f.get(c) not in (None, "")]
    app = col("app_cpu_nucleos")
    total = col("cpu_total_pct")
    rss = col("app_rss_mb")
    cores_prom = [r(st.fmean(col(c)), 1) for c in cols_core]
    cores_pico = [r(max(col(c)), 1) for c in cols_core]
    return {
        "cpu_total_prom": r(st.fmean(total), 1),
        "cpu_total_pico": r(max(total), 1),
        "cpu_user_prom": r(st.fmean(col("cpu_user_pct")), 1),
        "cpu_sys_prom": r(st.fmean(col("cpu_sys_pct")), 1),
        "cpu_iowait_prom": r(st.fmean(col("cpu_iowait_pct")), 2),
        "cores_prom": cores_prom,
        "cores_pico": cores_pico,
        "app_cpu_prom": r(st.fmean(app), 3),
        "app_cpu_pico": r(max(app), 3),
        "app_cpu_uso_limite_pct": r(100 * st.fmean(app) / ncores_limite, 1) if ncores_limite else None,
        "app_rss_prom": r(st.fmean(rss), 1),
        "app_rss_max": r(max(rss), 1),
        "app_hilos": int(max(col("app_hilos"))),
        "disco_r_iops": r(st.fmean(col("disco_r_iops")), 1),
        "disco_w_iops": r(st.fmean(col("disco_w_iops")), 1),
        "disco_r_mbs": r(st.fmean(col("disco_r_mbs")), 3),
        "disco_w_mbs": r(st.fmean(col("disco_w_mbs")), 3),
        "disco_iops_pico": r(max(a + b for a, b in zip(col("disco_r_iops"), col("disco_w_iops"))), 1),
        "gen_cpu_prom": r(st.fmean(col("gen_cpu_nucleos")), 3),
    }


def por_endpoint(peticiones):
    d = defaultdict(list)
    for p in peticiones:
        if 200 <= int(p["status"]) < 400:
            d[p["endpoint"]].append(float(p["latencia_ms"]))
    out = []
    for ep, v in d.items():
        v.sort()
        out.append({"endpoint": ep, "n": len(v), "p50": r(pct(v, 50)), "p95": r(pct(v, 95)), "p99": r(pct(v, 99))})
    return sorted(out, key=lambda e: -e["p95"])


def serie(peticiones, sistema):
    """Serie por segundo para la repeticion en vivo."""
    seg = defaultdict(list)
    bin_ = defaultdict(int)
    bout = defaultdict(int)
    err = defaultdict(int)
    for p in peticiones:
        s = int(float(p["t_s"]))
        bin_[s] += int(p["bytes_entrada"])
        bout[s] += int(p["bytes_salida"])
        if 200 <= int(p["status"]) < 400:
            seg[s].append(float(p["latencia_ms"]))
        else:
            err[s] += 1
    dur = max(list(seg) + [0]) + 1
    mon = {int(float(f["t_s"])): f for f in sistema}
    cols_core = [c for c in (sistema[0] if sistema else {}) if c.startswith("core_")]
    out = {k: [] for k in ["t", "rps", "p50", "p95", "p99", "errores", "red_in_kbs", "red_out_kbs",
                           "cpu_total", "app_cpu", "rss", "disco_iops", "disco_mbs", "gen_cpu", "cores"]}
    ultimo = None
    for s in range(dur):
        v = sorted(seg.get(s, []))
        f = mon.get(s) or mon.get(s + 1) or ultimo
        if f:
            ultimo = f
        out["t"].append(s)
        out["rps"].append(len(v))
        out["p50"].append(r(pct(v, 50), 1))
        out["p95"].append(r(pct(v, 95), 1))
        out["p99"].append(r(pct(v, 99), 1))
        out["errores"].append(err.get(s, 0))
        out["red_in_kbs"].append(r(bin_.get(s, 0) / 1024, 1))
        out["red_out_kbs"].append(r(bout.get(s, 0) / 1024, 1))
        g = lambda c: float(f[c]) if f and f.get(c) not in (None, "") else None
        out["cpu_total"].append(g("cpu_total_pct"))
        out["app_cpu"].append(g("app_cpu_nucleos"))
        out["rss"].append(g("app_rss_mb"))
        di = (g("disco_r_iops") or 0) + (g("disco_w_iops") or 0) if f else None
        out["disco_iops"].append(r(di, 1))
        dm = (g("disco_r_mbs") or 0) + (g("disco_w_mbs") or 0) if f else None
        out["disco_mbs"].append(r(dm, 3))
        out["gen_cpu"].append(g("gen_cpu_nucleos"))
        out["cores"].append([g(c) for c in cols_core] if f else [])
    return out


def cdf_hist(pets):
    v = sorted(float(p["latencia_ms"]) for p in pets if 200 <= int(p["status"]) < 400)
    if not v:
        return [], None
    ps = list(range(1, 100)) + [99.5, 99.9]
    cdf = [{"p": p, "ms": r(pct(v, p))} for p in ps]
    mx = max(v[-1], 1.001)
    bordes = [10 ** (math.log10(mx) * i / 30) for i in range(31)]
    cont = [0] * 30
    for x in v:
        i = 0 if x <= 1 else min(29, int(math.log10(x) / math.log10(mx) * 30))
        cont[i] += 1
    return cdf, {"bordes_ms": [r(b) for b in bordes], "conteos": cont}


def calor(cores, paso=5):
    filas = []
    for i in range(0, len(cores), paso):
        bloque = [c for c in cores[i:i + paso] if c and all(x is not None for x in c)]
        if not bloque:
            continue
        filas.append([r(st.fmean(c[j] for c in bloque), 1) for j in range(len(bloque[0]))])
    return {"paso_s": paso, "filas": filas}


def entorno(eid, cfg_e, slo):
    base = os.path.join(RES, eid)
    with open(os.path.join(base, "entorno.json"), encoding="utf-8") as f:
        ficha = json.load(f)
    lim = cfg_e.get("nucleos_disponibles") or ficha.get("nucleos_logicos")
    reposo = stats_sistema(leer_csv(os.path.join(base, "reposo", "sistema.csv")), lim)

    reps = []
    for d in sorted(glob.glob(os.path.join(base, "sostenida_*"))):
        with open(os.path.join(d, "resumen.json"), encoding="utf-8") as f:
            res = json.load(f)
        res.update(stats_sistema(leer_csv(os.path.join(d, "sistema.csv")), lim))
        res["_dir"] = d
        reps.append(res)

    escal = []
    for d in sorted(glob.glob(os.path.join(base, "escalado_*"))):
        with open(os.path.join(d, "resumen.json"), encoding="utf-8") as f:
            res = json.load(f)
        s = stats_sistema(leer_csv(os.path.join(d, "sistema.csv")), lim)
        escal.append({k: res.get(k) for k in ["vus", "rps", "p50_ms", "p95_ms", "p99_ms", "tasa_error_pct"]} |
                     {k: s.get(k) for k in ["app_cpu_prom", "cpu_total_prom", "app_rss_prom", "app_cpu_uso_limite_pct"]})
    escal.sort(key=lambda e: e["vus"])

    mediana, en_vivo, endpoints = {}, None, []
    cdf, histograma, calor_cpu = [], None, None
    if reps:
        claves = [k for k, v in reps[0].items() if isinstance(v, (int, float)) and not k.startswith("_")]
        for k in claves:
            vals = [x[k] for x in reps if isinstance(x.get(k), (int, float))]
            if vals:
                mediana[k] = r(st.median(vals), 3)
        for k in ["cores_prom", "cores_pico"]:
            if reps[0].get(k):
                mediana[k] = [r(st.median(x[k][i] for x in reps), 1) for i in range(len(reps[0][k]))]
        rep_med = sorted(reps, key=lambda x: x["rps"])[len(reps) // 2]
        pets = leer_csv(os.path.join(rep_med["_dir"], "peticiones.csv"))
        en_vivo = serie(pets, leer_csv(os.path.join(rep_med["_dir"], "sistema.csv")))
        en_vivo["repeticion"] = os.path.basename(rep_med["_dir"])
        endpoints = por_endpoint(pets)
        cdf, histograma = cdf_hist(pets)
        calor_cpu = calor(en_vivo["cores"])

    costo = cfg_e.get("costo_mes_usd")
    rps = mediana.get("rps")
    cpm = None
    if costo and rps:
        cpm = costo / (rps * 3600 * 730) * 1e6
    aguanta = None
    if mediana:
        aguanta = (mediana.get("p95_ms", 1e9) <= slo["p95_ms"] and mediana.get("tasa_error_pct", 100) <= slo["error_pct"])
    for x in reps:
        x.pop("_dir", None)
    med = lambda k: r(st.median(x[k] for x in reps if isinstance(x.get(k), (int, float))), 2) if reps else None
    percentiles = {"p50": med("p50_ms"), "p90": med("p90_ms"), "p95": med("p95_ms"),
                   "p99": med("p99_ms"), "max": med("max_ms")}
    eficiencia = {"rps_por_nucleo": r(rps / mediana["app_cpu_prom"], 1) if rps and mediana.get("app_cpu_prom") else None,
                  "rps_por_nucleo_limite": r(rps / lim, 1) if rps and lim else None}
    rep_serie = [{"rep": i + 1, "rps": x.get("rps"), "p95_ms": x.get("p95_ms")} for i, x in enumerate(reps)]
    return {
        "id": eid,
        "nombre": cfg_e.get("nombre", eid),
        "tipo": cfg_e.get("tipo", "otro"),
        "orden": cfg_e.get("orden", 99),
        "config": {k: v for k, v in cfg_e.items() if k not in ("nombre", "tipo", "orden")},
        "ficha": ficha,
        "reposo": reposo,
        "repeticiones": reps,
        "mediana": mediana,
        "rps_dispersion_pct": r(100 * (max(x["rps"] for x in reps) - min(x["rps"] for x in reps)) / st.median(
            [x["rps"] for x in reps]), 1) if len(reps) > 1 else None,
        "escalado": escal,
        "endpoints": endpoints,
        "en_vivo": en_vivo,
        "costo_mes_usd": costo,
        "costo_por_millon_usd": r(cpm, 3),
        "aguanta": aguanta,
        "cdf": cdf,
        "histograma": histograma,
        "eficiencia": eficiencia,
        "percentiles": percentiles,
        "calor_cpu": calor_cpu,
        "repeticiones_serie": rep_serie,
    }


def main():
    import argparse
    global SALIDA
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=os.path.join(AQUI, "config_entornos.json"))
    ap.add_argument("--salida", default=SALIDA)
    a = ap.parse_args()
    SALIDA = a.salida
    with open(a.config, encoding="utf-8") as f:
        cfg = json.load(f)
    datos = {"slo": cfg["slo"], "entornos": [], "pendientes": []}
    for eid, ce in cfg["entornos"].items():
        if os.path.exists(os.path.join(RES, eid, "entorno.json")):
            datos["entornos"].append(entorno(eid, ce, cfg["slo"]))
            print(f"ok  {eid}")
        else:
            datos["pendientes"].append({"id": eid, "nombre": ce.get("nombre", eid), "tipo": ce.get("tipo"),
                                        "config": ce})
            print(f"--  {eid} (sin datos todavia)")
    datos["entornos"].sort(key=lambda e: e["orden"])
    import datetime
    datos["generado"] = datetime.datetime.now().isoformat(timespec="seconds")
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as f:
        f.write("// Generado por medicion/agregar.py. No editar a mano.\nwindow.DATOS = ")
        json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"Escrito {os.path.normpath(SALIDA)} ({os.path.getsize(SALIDA)//1024} KB)")


def empaquetar(carpeta):
    """tablero.html: un solo archivo con todo adentro (abre con doble clic, sin internet)."""
    def leer(n):
        p = os.path.join(carpeta, n)
        return open(p, encoding="utf-8").read() if os.path.exists(p) else ""
    html = leer("index.html")
    if not html:
        return
    for n in ["vendor/chart.umd.min.js", "datos.js", "narrativa.js"]:
        html = html.replace(f'<script src="{n}"></script>', "<script>\n" + leer(n).replace("</script", "<\\/script") + "\n</script>")
    salida = os.path.join(carpeta, "tablero.html")
    with open(salida, "w", encoding="utf-8") as f:
        f.write('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                '</head>\n<body>\n' + html + '\n</body>\n</html>\n')
    print(f"Escrito {os.path.normpath(salida)} ({os.path.getsize(salida)//1024} KB) <- abre este archivo")


if __name__ == "__main__":
    main()
