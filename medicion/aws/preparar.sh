#!/usr/bin/env bash
# Prepara una instancia Amazon Linux 2023 para medir PetClinic con el MISMO protocolo.
# Uso (dentro de la instancia):  bash preparar.sh
set -euo pipefail

echo "== Instalando Java 21, Python y psutil"
sudo dnf install -y java-21-amazon-corretto-headless python3 python3-pip >/dev/null
python3 -m pip install --user --quiet psutil

echo "== Versiones"
java -version 2>&1 | head -1
python3 -c "import psutil, platform; print('psutil', psutil.__version__, '| python', platform.python_version())"

echo "== Ficha técnica de la instancia"
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
TIPO=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-type || echo "?")
ZONA=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/availability-zone || echo "?")
echo "Tipo de instancia: $TIPO   Zona: $ZONA"
lscpu | grep -E "Model name|^CPU\(s\)|Thread|Core"
free -m | head -2
lsblk -d -o NAME,SIZE,TYPE | head -5
{
  echo "tipo_instancia=$TIPO"
  echo "zona=$ZONA"
  lscpu
  free -m
} > ~/medicion/ficha_aws.txt 2>/dev/null || true

if [ ! -f ~/petclinic.jar ]; then
  echo "AVISO: no encuentro ~/petclinic.jar. Cópialo desde tu PC (ver la guía, paso 5)."
fi
echo "== Listo. Siguiente paso: cd ~/medicion && python3 ejecutar.py --modo local --entorno aws-t3-small --jar ~/petclinic.jar --precio-hora 0.0208"
