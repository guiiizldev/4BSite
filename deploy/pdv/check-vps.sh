#!/usr/bin/env bash
set -u

errors=0
architecture="$(uname -m)"
memory_mb="$(awk '/MemTotal/ { printf "%d", $2 / 1024 }' /proc/meminfo)"
available_mb="$(awk '/MemAvailable/ { printf "%d", $2 / 1024 }' /proc/meminfo)"
disk_mb="$(df -Pm /var | awk 'NR == 2 { print $4 }')"

echo "4Byts PDV - verificação da VPS"
echo "Arquitetura: ${architecture}"
echo "Memória total: ${memory_mb} MB"
echo "Memória disponível agora: ${available_mb} MB"
echo "Espaço disponível em /var: ${disk_mb} MB"

if [[ "${architecture}" != "x86_64" && "${architecture}" != "amd64" ]]; then
  echo "ERRO: a imagem oficial do SQL Server exige arquitetura x86-64."
  errors=$((errors + 1))
fi

if (( memory_mb < 4096 )); then
  echo "ERRO: esta VPS tem menos de 4 GB de RAM. Não inicie o SQL Server junto da GriffyStore."
  errors=$((errors + 1))
elif (( memory_mb < 6144 )); then
  echo "ATENÇÃO: há menos de 6 GB de RAM total; confirme o consumo da GriffyStore antes de continuar."
fi

if (( disk_mb < 12288 )); then
  echo "ERRO: reserve pelo menos 12 GB livres em /var para imagem, banco e publicação."
  errors=$((errors + 1))
fi

echo
echo "Dependências:"
for command_name in docker dotnet node npm nginx openssl; do
  if command -v "${command_name}" >/dev/null 2>&1; then
    echo "OK: ${command_name} -> $(command -v "${command_name}")"
  else
    echo "FALTA: ${command_name}"
  fi
done

echo
echo "Portas locais reservadas para o PDV:"
if ss -ltn 2>/dev/null | awk '{ print $4 }' | grep -Eq '(^|:)(1433|5260)$'; then
  ss -ltnp 2>/dev/null | grep -E ':(1433|5260)([[:space:]]|$)' || true
  echo "ERRO: a porta 1433 ou 5260 já está em uso."
  errors=$((errors + 1))
else
  echo "OK: 127.0.0.1:1433 e 127.0.0.1:5260 estão livres."
fi

echo
echo "Serviços Nginx existentes (somente leitura):"
grep -R "server_name" /etc/nginx/sites-enabled 2>/dev/null || echo "Não foi possível ler /etc/nginx/sites-enabled."

echo
if (( errors > 0 )); then
  echo "Resultado: ${errors} bloqueio(s). Não prossiga com a instalação."
  exit 1
fi

echo "Resultado: requisitos básicos aprovados."
