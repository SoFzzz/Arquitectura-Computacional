# Guía: medir PetClinic en una instancia de AWS EC2

Objetivo: correr **el mismo protocolo** (`ejecutar.py`) que usamos en la máquina física y en Docker, en una instancia de nube concreta, con ficha técnica y precio. Toma unos 45 minutos (25 de ellos son la medición, que corre sola).

> Costo esperado: una t3.small cuesta 0,0208 USD/hora. Una hora de prueba cuesta menos de 0,05 USD. Si tu cuenta es nueva (creada después del 15/07/2025), el plan gratuito da créditos de 100 a 200 USD y la t3.small es elegible. **Al terminar, termina la instancia (paso 9)** para no seguir pagando.

---

## 1. Crear la cuenta / entrar a la consola
1. Entra a <https://console.aws.amazon.com/> con tu cuenta (o crea una en <https://aws.amazon.com/free>).
2. Arriba a la derecha elige la región **US East (N. Virginia) us-east-1**. Los precios del tablero son de esa región.

## 2. Lanzar la instancia
1. Busca **EC2** → **Instances** → **Launch instances**.
2. **Name:** `petclinic-benchmark`.
3. **AMI:** *Amazon Linux 2023 AMI* (64-bit x86). No elijas ARM, para comparar con la misma arquitectura x86 del portátil.
4. **Instance type:** `t3.small` (2 vCPU, 2 GiB). Si tu cuenta no es de plan gratuito y quieres más memoria, usa `t3.medium` (2 vCPU, 4 GiB, 0,0416 USD/h) y cambia el nombre del entorno en los pasos 7 y 8.
5. **Key pair:** *Create new key pair* → nombre `petclinic`, tipo RSA, formato **.pem** → se descarga `petclinic.pem`. Guárdalo en `medicion\aws\` y **nunca lo subas al repositorio** (el `.gitignore` ya lo excluye).
6. **Network settings:** deja *Allow SSH traffic from* → **My IP**. No hace falta abrir el puerto 8080, porque la carga se genera dentro de la instancia, igual que en local.
7. **Storage:** 8 GiB gp3 (el valor por defecto).
8. Opcional, en *Advanced details* → **Credit specification**, el valor por defecto es *Unlimited*. Déjalo así y anótalo, porque es parte de la ficha técnica (ver la nota del final).
9. **Launch instance**. Espera a que el estado sea *Running* y copia la **Public IPv4 address** (por ejemplo `<IP-PUBLICA>`).

## 3. Permisos de la llave (Windows, PowerShell)
```powershell
cd D:\Escritorio\trabajo\UCC\Quinto\arquitectura\medicion\aws
icacls petclinic.pem /inheritance:r
icacls petclinic.pem /grant:r "$($env:USERNAME):(R)"
```

## 4. Probar la conexión
```powershell
ssh -i petclinic.pem ec2-user@<IP-PUBLICA>
```
Escribe `yes` la primera vez. Si entras, sal con `exit`.

## 5. Copiar los guiones y el .jar a la instancia (desde tu PC)
```powershell
cd D:\Escritorio\trabajo\UCC\Quinto\arquitectura
ssh -i medicion\aws\petclinic.pem ec2-user@<IP-PUBLICA> "mkdir -p ~/medicion"
scp -i medicion\aws\petclinic.pem medicion\carga.py medicion\monitor.py medicion\ejecutar.py medicion\aws\preparar.sh ec2-user@<IP-PUBLICA>:~/medicion/
scp -i medicion\aws\petclinic.pem spring-petclinic\target\spring-petclinic-4.0.0-SNAPSHOT.jar ec2-user@<IP-PUBLICA>:~/petclinic.jar
```
El .jar pesa unos 65 MB y es el mismo archivo que medimos en local y en Docker.

## 6. Preparar la instancia
```powershell
ssh -i medicion\aws\petclinic.pem ec2-user@<IP-PUBLICA>
```
Ya dentro de la instancia:
```bash
cd ~/medicion
bash preparar.sh
```
Instala Java 21 (Amazon Corretto), Python y psutil, y muestra la ficha técnica real (modelo de CPU, núcleos y memoria). **Toma una captura de esta salida para la sustentación.**

## 7. Correr la medición (unos 25 minutos)
Usa `nohup` para que siga corriendo aunque se corte el SSH:
```bash
cd ~/medicion
nohup python3 ejecutar.py --modo local --entorno aws-t3-small --jar ~/petclinic.jar \
  --precio-hora 0.0208 --nota "AWS EC2 t3.small us-east-1, Amazon Linux 2023, Corretto 21" \
  > medicion_aws.log 2>&1 &
tail -f medicion_aws.log
```
Verás las mismas líneas que en local (`req/s`, `p50`, `p95`, `p99`). `Ctrl+C` solo deja de mostrar el log; la prueba sigue. Termina cuando aparezca `Listo. Resultados en ...`.

Si quieres comprobar que la memoria residente es real, en otra sesión SSH ejecuta `top -p $(pgrep -f petclinic.jar)` y mira la columna **RES**.

## 8. Traer los resultados a tu PC
```bash
cd ~/medicion && tar czf resultados_aws.tgz resultados/aws-t3-small ficha_aws.txt
```
Desde tu PC (PowerShell):
```powershell
cd D:\Escritorio\trabajo\UCC\Quinto\arquitectura\medicion
scp -i aws\petclinic.pem ec2-user@<IP-PUBLICA>:~/medicion/resultados_aws.tgz .
tar xzf resultados_aws.tgz
python agregar.py
```
`agregar.py` detecta la carpeta `resultados/aws-t3-small` y el tablero (`tablero/index.html`) pasa ese entorno de "pendiente" a medido.

## 9. Terminar la instancia (importante)
Consola EC2 → selecciona `petclinic-benchmark` → **Instance state → Terminate instance**. Así dejas de pagar por la instancia y por su disco.

---

## Notas para la sustentación
- **Créditos de CPU (familia t3).** Una t3.small tiene como *línea base* el 20 % de cada vCPU. Por encima de eso gasta créditos acumulados. En modo *Unlimited* (el valor por defecto) no se frena, pero cobra 0,05 USD por vCPU-hora extra. En modo *Standard*, al acabarse los créditos, la CPU baja al 20 %. Si en la serie de tiempo ves que el throughput cae a mitad de la prueba, este es el motivo. Es una diferencia de arquitectura frente a la máquina física.
- **vCPU ≠ núcleo físico.** Las 2 vCPU de una t3 son 2 hilos (hyperthreads) de **un** núcleo físico de un Xeon. El portátil tiene 4 núcleos físicos y 8 hilos.
- **Disco EBS gp3.** Es disco por red, con 3.000 IOPS y 125 MB/s incluidos. Como PetClinic usa H2 en memoria, el disco casi no se usa. Los datos lo confirman.
- **El generador corre dentro de la instancia**, igual que en local, para que la red no sesgue la comparación. Si además quieres medir la latencia de internet, abre el puerto 8080 en el Security Group y corre `python carga.py --url http://IP:8080 --vus 30 --duracion 300 --salida remoto.csv` desde tu PC. Esa medición va aparte y no reemplaza a la principal.
