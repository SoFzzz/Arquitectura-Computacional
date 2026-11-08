"""Generador de carga para Spring PetClinic (el mismo en los 3 entornos).

Cada usuario virtual (VU) repite un flujo fijo con conexiones keep-alive:
  1. GET  /                         inicio (plantilla Thymeleaf)
  2. GET  /owners?lastName=         listar duenos (pagina 1)
  3. GET  /owners?lastName=<X>      buscar por apellido
  4. GET  /owners/<id>              detalle (JOIN dueno + mascotas + visitas)
  5. GET  /vets.html                listar veterinarios
  6. POST /owners/<id>/edit         editar un dueno (escritura en BD, tamano fijo)
     (--escritura crear usa POST /owners/new: sirve para demostrar la degradacion)

Guarda cada peticion en un CSV crudo:
  t_s, vu, endpoint, status, latencia_ms, bytes_entrada, bytes_salida

Uso:
  python carga.py --url http://localhost:8080 --vus 30 --duracion 300 --salida peticiones.csv
"""
import argparse
import csv
import http.client
import json
import random
import statistics
import threading
import time
import urllib.parse

MODO_ESCRITURA = "editar"
APELLIDOS = ["Davis", "Franklin", "Black", "Escobito", "Coleman", "Estaban",
             "Rodriquez", "McTavish", "Schroeder"]


# Duenos originales (data.sql). Editar con estos datos mantiene la BD del mismo
# tamano durante toda la prueba; crear duenos nuevos la hace crecer y el listado
# (que pagina en memoria) se degrada, lo que vuelve las repeticiones incomparables.
DUENOS = [
    ("George", "Franklin", "110 W. Liberty St.", "Madison"),
    ("Betty", "Davis", "638 Cardinal Ave.", "Sun Prairie"),
    ("Eduardo", "Rodriquez", "2693 Commerce St.", "McFarland"),
    ("Harold", "Davis", "563 Friendly St.", "Windsor"),
    ("Peter", "McTavish", "2387 S. Fair Way", "Madison"),
    ("Jean", "Coleman", "105 N. Lake St.", "Monona"),
    ("Jeff", "Black", "1450 Oak Blvd.", "Monona"),
    ("Maria", "Escobito", "345 Maple St.", "Madison"),
    ("David", "Schroeder", "2749 Blackhawk Trail", "Madison"),
    ("Carlos", "Estaban", "2335 Independence La.", "Waunakee"),
]


def flujo(rnd, vu, it, modo_escritura="editar"):
    """Devuelve la lista de (etiqueta, metodo, ruta, cuerpo) de una iteracion."""
    oid = rnd.randint(1, 10)
    nombre, apellido, direccion, ciudad = DUENOS[oid - 1]
    if modo_escritura == "crear":
        escritura = ("crear_dueno", "POST", "/owners/new", urllib.parse.urlencode({
            "firstName": "Carga", "lastName": f"Vu{vu}", "address": "Calle 1", "city": "Pasto",
            "telephone": f"{rnd.randint(0, 9_999_999_999):010d}"}))
    else:
        escritura = ("editar_dueno", "POST", f"/owners/{oid}/edit", urllib.parse.urlencode({
            "firstName": nombre, "lastName": apellido, "address": direccion, "city": ciudad,
            "telephone": f"608555{rnd.randint(0, 9999):04d}"}))
    return [
        ("inicio", "GET", "/", None),
        ("listar_duenos", "GET", "/owners?lastName=", None),
        ("buscar_apellido", "GET", f"/owners?lastName={rnd.choice(APELLIDOS)}", None),
        ("detalle_dueno", "GET", f"/owners/{oid}", None),
        ("veterinarios", "GET", "/vets.html", None),
        escritura,
    ]


def trabajador(vu, host, port, fin, pausa, t0, registros, lock):
    rnd = random.Random(vu)
    conn = None
    locales = []
    it = 0
    while time.perf_counter() < fin:
        for etiqueta, metodo, ruta, cuerpo in flujo(rnd, vu, it, MODO_ESCRITURA):
            if time.perf_counter() >= fin:
                break
            headers = {"User-Agent": "petclinic-carga/1.0", "Connection": "keep-alive"}
            datos = None
            if cuerpo is not None:
                datos = cuerpo.encode()
                headers["Content-Type"] = "application/x-www-form-urlencoded"
            # tamano aproximado de la peticion (linea + cabeceras + cuerpo)
            bytes_out = len(metodo) + len(ruta) + 12 + sum(len(k) + len(v) + 4 for k, v in headers.items()) \
                + (len(datos) if datos else 0)
            inicio = time.perf_counter()
            status, bytes_in = 0, 0
            try:
                if conn is None:
                    conn = http.client.HTTPConnection(host, port, timeout=10)
                conn.request(metodo, ruta, body=datos, headers=headers)
                resp = conn.getresponse()
                cuerpo_resp = resp.read()
                status = resp.status
                bytes_in = len(cuerpo_resp) + sum(len(k) + len(v) + 4 for k, v in resp.getheaders())
                if resp.will_close:
                    conn.close()
                    conn = None
            except Exception:
                status = -1
                try:
                    if conn:
                        conn.close()
                except Exception:
                    pass
                conn = None
            fin_p = time.perf_counter()
            locales.append((round(inicio - t0, 4), vu, etiqueta, status,
                            round((fin_p - inicio) * 1000, 3), bytes_in, bytes_out))
            if pausa > 0:
                time.sleep(pausa)
        it += 1
    with lock:
        registros.extend(locales)


def percentil(ordenados, p):
    if not ordenados:
        return None
    k = (len(ordenados) - 1) * p / 100
    f = int(k)
    c = min(f + 1, len(ordenados) - 1)
    return ordenados[f] + (ordenados[c] - ordenados[f]) * (k - f)


def resumir(registros, duracion):
    ok = [r for r in registros if 200 <= r[3] < 400]
    lat = sorted(r[4] for r in ok)
    errores = len(registros) - len(ok)
    return {
        "peticiones": len(registros),
        "errores": errores,
        "tasa_error_pct": round(100 * errores / max(1, len(registros)), 3),
        "rps": round(len(ok) / duracion, 2),
        "lat_media_ms": round(statistics.fmean(lat), 2) if lat else None,
        "p50_ms": round(percentil(lat, 50), 2) if lat else None,
        "p90_ms": round(percentil(lat, 90), 2) if lat else None,
        "p95_ms": round(percentil(lat, 95), 2) if lat else None,
        "p99_ms": round(percentil(lat, 99), 2) if lat else None,
        "max_ms": round(lat[-1], 2) if lat else None,
        "red_entrada_kbs": round(sum(r[5] for r in registros) / duracion / 1024, 2),
        "red_salida_kbs": round(sum(r[6] for r in registros) / duracion / 1024, 2),
    }


def ejecutar(url, vus, duracion, pausa=0.05, salida=None):
    u = urllib.parse.urlparse(url)
    host, port = u.hostname, u.port or 80
    registros, lock = [], threading.Lock()
    t0 = time.perf_counter()
    fin = t0 + duracion
    hilos = [threading.Thread(target=trabajador, args=(v, host, port, fin, pausa, t0, registros, lock), daemon=True)
             for v in range(vus)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join(duracion + 30)
    registros.sort(key=lambda r: r[0])
    if salida:
        with open(salida, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["t_s", "vu", "endpoint", "status", "latencia_ms", "bytes_entrada", "bytes_salida"])
            w.writerows(registros)
    return resumir(registros, duracion)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8080")
    ap.add_argument("--vus", type=int, default=30)
    ap.add_argument("--duracion", type=int, default=300)
    ap.add_argument("--pausa", type=float, default=0.05, help="segundos entre peticiones de un VU")
    ap.add_argument("--salida", default=None)
    ap.add_argument("--resumen", default=None, help="ruta JSON para el resumen")
    ap.add_argument("--escritura", choices=["editar", "crear"], default="editar")
    a = ap.parse_args()
    MODO_ESCRITURA = a.escritura
    res = ejecutar(a.url, a.vus, a.duracion, a.pausa, a.salida)
    res.update({"vus": a.vus, "duracion_s": a.duracion, "pausa_s": a.pausa})
    if a.resumen:
        with open(a.resumen, "w", encoding="utf-8") as f:
            json.dump(res, f, indent=2)
    print(json.dumps(res, ensure_ascii=False))
