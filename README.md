# Dimensionar una carga real: Spring PetClinic

Proyecto final de **Arquitectura Computacional** (UCC). Medimos la misma aplicación web, con la misma carga, en una máquina física, en contenedores Docker y en una instancia de AWS. Con esos datos decidimos en qué máquina debería correr y de qué tamaño.

**Tablero interactivo:** https://sofzzz.github.io/Arquitectura-Computacional/

El tablero reemplaza al informe. Muestra la aplicación, cómo se generó la carga, qué se midió, la comparación entre entornos y la recomendación, con gráficas y una reproducción "en vivo" de las pruebas.

---

## La aplicación
[Spring PetClinic](https://github.com/spring-projects/spring-petclinic) es la aplicación de ejemplo oficial de Spring Boot: una clínica veterinaria con dueños, mascotas, veterinarios y visitas. Usamos la versión 4.0.0-SNAPSHOT con Java 21 y su base de datos H2 **en memoria**.

## Cómo generamos la carga
- **30 usuarios virtuales** a la vez. Cada uno repite este recorrido, con 50 ms de pausa entre peticiones:
  1. inicio
  2. listar dueños
  3. buscar por apellido
  4. detalle del dueño
  5. veterinarios
  6. editar el dueño
- **El mismo protocolo en cada entorno:**
  - arranque
  - 30 s de reposo
  - 60 s de calentamiento (no se cuenta)
  - **3 repeticiones de 5 minutos**, de las que se reporta la mediana
  - escalones de 5, 10, 20, 40, 80 y 120 usuarios
- **Meta (SLO):** p95 ≤ 300 ms y errores ≤ 1 %.

## Qué medimos
| Métrica | Herramienta |
|---|---|
| Throughput (req/s), latencia p50/p95/p99, errores | `medicion/carga.py`: una fila por petición |
| CPU de la app frente a su límite, memoria residente, disco, red | `medicion/monitor.py`: una muestra por segundo |
| Tiempo de arranque | `medicion/ejecutar.py`: segundos hasta el primer HTTP 200 |

## Resultados
Mediana de 3 repeticiones de 5 minutos con 30 usuarios. **0 errores en todos los entornos.**

| Entorno | req/s | p95 | CPU usada | Memoria | ¿Cumple? | US$/mes |
|---|---|---|---|---|---|---|
| Física (portátil i5-8300H, 4 núcleos, 24 GB, Windows 10) | 514 | 24 ms | 2,7 núcleos | 714 MB | Sí | ~31 (estimado) |
| **AWS EC2 t3.small** (2 vCPU, 2 GB, Amazon Linux 2023) | 397 | 79 ms | 96 % | 527 MB | **Sí** | **15,82** |
| Contenedor Docker 2 CPU / 1 GB | 251 | 194 ms | 100 % (2 de 2) | 364 MB | Sí, justo | 62,30 |
| Contenedor Docker 1 CPU / 512 MB | 134 | 543 ms | 100 % (1 de 1) | 345 MB | **No** | 31,20 |
| Contenedor sin límites (control) | 434 | 51 ms | — | 610 MB | Sí | — |

- Precios on-demand de AWS us-east-1 (8 de noviembre de 2026).
- Los contenedores se cotizan con su equivalente en AWS Fargate.
- El costo de la física es una estimación: equipo amortizado en 3 años más la energía.

## Recomendación
**AWS t3.small (2 vCPU, 2 GB).** Cumple la meta con 30 usuarios (p95 de 79 ms, 0 errores) y es la opción más barata, también por petición atendida.

PetClinic está **limitada por CPU**: es el único recurso que llega cerca del 100 %. La memoria, el disco y la red quedan lejos de su límite. Por eso, si la carga crece, hay que darle **más CPU, no más memoria**.

Se **descarta el contenedor de 1 CPU / 512 MB**: no cumple (p95 de 543 ms), está al 100 % de su CPU y le sobra memoria.


---

## Estructura del repositorio
```
docs/                       Tablero (lo publica GitHub Pages)
  index.html                Abrir en el navegador; también funciona con doble clic, sin servidor
  datos.js                  Datos agregados, generados por medicion/agregar.py
  narrativa.js              Texto del veredicto
  css/, js/, vendor/        Estilos, secciones del tablero y Chart.js 4.4.1
medicion/                   Cómo se midió
  carga.py                  Generador de carga
  monitor.py                Monitor de CPU, memoria, disco y red
  ejecutar.py               Protocolo completo de un entorno
  agregar.py                Calcula medianas y percentiles, y escribe docs/datos.js
  config_entornos.json      Nombre, precio y capacidades de cada entorno
  aws/GUIA_AWS.md           Paso a paso para medir en EC2
  resultados/<entorno>/     Datos crudos: peticiones.csv, sistema.csv, resumen.json, entorno.json, app.log
```

## Reproducir
Requisitos: Java 21, Maven, Python 3 con `psutil`, y Docker para los contenedores.

```powershell
# 0. Compilar PetClinic (repositorio aparte)
git clone https://github.com/spring-projects/spring-petclinic.git
cd spring-petclinic; mvn -DskipTests package; docker build -t petclinic-bench .
cd ..\medicion

# 1. Máquina física
python ejecutar.py --modo local --entorno fisica-local --jar ..\spring-petclinic\target\spring-petclinic-4.0.0-SNAPSHOT.jar

# 2. Contenedores
python ejecutar.py --modo docker --entorno contenedor-2cpu-1g   --cpus 2 --memoria 1g
python ejecutar.py --modo docker --entorno contenedor-1cpu-512m --cpus 1 --memoria 512m
python ejecutar.py --modo docker --entorno contenedor-sin-limite --cpus 8 --memoria 8g --reps 1

# 3. AWS: seguir medicion/aws/GUIA_AWS.md

# 4. Regenerar el tablero
python agregar.py
```

El detalle de las decisiones de método está en [`medicion/README.md`](medicion/README.md).
