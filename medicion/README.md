# Medición de Spring PetClinic en tres tipos de entorno

Guiones para dimensionar PetClinic con **el mismo protocolo** en una máquina física, en contenedores Docker con límites y en una instancia de AWS. El resultado se ve en `../docs/index.html`.

## Archivos
| Archivo | Qué hace |
|---|---|
| `carga.py` | Generador de carga. N usuarios virtuales repiten el flujo: inicio → listar dueños → buscar por apellido → detalle → veterinarios → editar dueño. Usa keep-alive y 50 ms de pausa. Guarda una fila por petición. |
| `monitor.py` | Una fila por segundo: CPU total, de usuario y de kernel, CPU por núcleo, CPU y memoria residente de la app, IOPS y MB/s de disco, red. En Docker lee los cgroups del contenedor. |
| `ejecutar.py` | Protocolo completo de un entorno: arranque → reposo 30 s → calentamiento 60 s → 3 × 5 min sostenida → escalado 5/10/20/40/80/120 VUs. |
| `agregar.py` | Calcula las medianas, las series y el escalado, y escribe `../docs/datos.js`, que lee el tablero. |
| `config_entornos.json` | Lo que no sale de la medición: nombre, precio mensual con su fuente y capacidades de cada entorno. |
| `aws/GUIA_AWS.md` | Paso a paso para medir en EC2. |
| `resultados/<entorno>/` | Datos crudos (`peticiones.csv`, `sistema.csv`, `resumen.json`, `entorno.json`, `app.log`). |

## Reproducir
```powershell
# 0. compilar
cd spring-petclinic; mvn -DskipTests package; docker build -t petclinic-bench .
cd ..\medicion
# 1. física
python ejecutar.py --modo local --entorno fisica-local --jar ..\spring-petclinic\target\spring-petclinic-4.0.0-SNAPSHOT.jar
# 2. contenedores
python ejecutar.py --modo docker --entorno contenedor-2cpu-1g   --cpus 2 --memoria 1g
python ejecutar.py --modo docker --entorno contenedor-1cpu-512m --cpus 1 --memoria 512m
python ejecutar.py --modo docker --entorno contenedor-sin-limite --cpus 8 --memoria 8g --reps 1
# 3. nube: ver aws/GUIA_AWS.md
# 4. tablero
python agregar.py
```

## Decisiones de método
- **El generador corre en el mismo host que la app** en los tres entornos, para que la red de internet no sesgue la comparación. Su CPU se mide aparte (`gen_cpu_nucleos`).
- **Editar en vez de crear dueños.** Crear dueños sin parar hace crecer la BD, y el listado (que pagina en memoria) pasa de 14 ms a 2,6 s en un minuto. Así ninguna repetición sería comparable con otra. Con `python carga.py --escritura crear` se puede reproducir la degradación.
- **Mediana de 3 repeticiones** y percentiles p50/p95/p99, nunca solo el promedio. El calentamiento no se cuenta porque es cuando la JVM compila con JIT.
- **Memoria residente real:** en local es el RSS del proceso java. En Docker es la memoria anónima del cgroup (`memory.stat: anon`), que no cuenta la caché de archivos.
- **Red:** en Windows el tráfico de loopback no aparece en los contadores del sistema. Por eso la red de la app se calcula con los bytes de cada petición y respuesta, medidos por el generador.
