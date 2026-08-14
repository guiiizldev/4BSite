# Homologação do 4Byts PDV na VPS

Esta implantação é isolada do site principal e da GriffyStore:

- frontend: `/var/www/4byts-pdv/frontend`;
- API .NET: `/var/www/4byts-pdv/api`, em `127.0.0.1:5260`;
- SQL Server: container `4byts-pdv-sqlserver`, em `127.0.0.1:1433`;
- configuração privada: `/etc/4byts-pdv`;
- Nginx: virtual host separado para `pdv.4byts.com`.

O SQL Server Developer é destinado somente a desenvolvimento e homologação. Antes de uma operação comercial, escolha uma edição devidamente licenciada ou avalie o SQL Server Express conforme a carga real.

## 1. Verificação obrigatória

O SQL Server exige arquitetura x86-64 e pelo menos 2 GB de RAM somente para iniciar. Como a VPS também executa a GriffyStore, este projeto bloqueia a instalação quando a máquina tem menos de 4 GB no total.

```bash
cd /var/www/4byts
git pull --ff-only origin main
bash deploy/pdv/check-vps.sh
```

Não prossiga quando o script informar um bloqueio. Instale apenas as dependências indicadas como ausentes: Docker com Compose v2, SDK .NET 8, Node.js 22, Nginx, OpenSSL e rsync.

## 2. DNS no Cloudflare

Crie um registro:

| Tipo | Nome | Conteúdo | Proxy |
| --- | --- | --- | --- |
| A | `pdv` | IP público da VPS | Ativado |

Esse registro não altera `4byts.com`, `www` nem os domínios da GriffyStore.

## 3. Segredos da homologação

Execute uma vez. O bloco reutiliza a credencial interna da central de licenças sem imprimi-la e cria chaves independentes para o SQL Server, JWT e criptografia do PDV.

```bash
sudo install -d -m 750 -o root -g www-data /etc/4byts-pdv

if ! sudo grep -q '^LICENSE_SERVICE_API_KEY=' /etc/4byts/4byts-api.env; then
  central_key="$(openssl rand -hex 32)"
  printf 'LICENSE_SERVICE_API_KEY=%s\n' "$central_key" | sudo tee -a /etc/4byts/4byts-api.env >/dev/null
  sudo chown root:www-data /etc/4byts/4byts-api.env
  sudo chmod 640 /etc/4byts/4byts-api.env
  sudo systemctl restart 4byts-api
fi

service_key="$(sudo sed -n 's/^LICENSE_SERVICE_API_KEY=//p' /etc/4byts/4byts-api.env | tail -n 1)"
sql_password="Aa1!$(openssl rand -hex 24)"
jwt_secret="$(openssl rand -hex 48)"
encryption_key="$(openssl rand -hex 48)"

if [ ! -f /etc/4byts-pdv/sqlserver.env ]; then
  printf 'ACCEPT_EULA=Y\nMSSQL_PID=Developer\nMSSQL_MEMORY_LIMIT_MB=2048\nMSSQL_SA_PASSWORD=%s\n' "$sql_password" | sudo tee /etc/4byts-pdv/sqlserver.env >/dev/null
fi

if [ ! -f /etc/4byts-pdv/pdv-api.env ]; then
  {
    printf 'ASPNETCORE_ENVIRONMENT=Production\n'
    printf 'ASPNETCORE_URLS=http://127.0.0.1:5260\n'
    printf 'HORUSPDV_CONNECTION_STRING="Server=127.0.0.1,1433;Database=HorusPdv;User Id=sa;Password=%s;Encrypt=True;TrustServerCertificate=True;MultipleActiveResultSets=True"\n' "$sql_password"
    printf 'Auth__JwtSecret=%s\n' "$jwt_secret"
    printf 'Auth__Issuer=4byts-pdv-api\nAuth__Audience=4byts-pdv-web\n'
    printf 'Security__EncryptionKey=%s\n' "$encryption_key"
    printf 'Security__CorsOrigins=https://pdv.4byts.com\nSecurity__TrustForwardedHeaders=true\n'
    printf 'Licensing__Enabled=true\nLicensing__BaseUrl=http://127.0.0.1:4310\nLicensing__ServiceKey=%s\n' "$service_key"
    printf 'Recaptcha__Enabled=false\nEmail__Enabled=false\n'
  } | sudo tee /etc/4byts-pdv/pdv-api.env >/dev/null
fi

sudo chown root:www-data /etc/4byts-pdv/sqlserver.env /etc/4byts-pdv/pdv-api.env
sudo chmod 640 /etc/4byts-pdv/sqlserver.env /etc/4byts-pdv/pdv-api.env
unset service_key sql_password jwt_secret encryption_key central_key
```

Não apague nem regenere `Security__EncryptionKey` depois que houver ativações ou senhas SMTP criptografadas.

## 4. SQL Server privado

```bash
cd /var/www/4byts
sudo docker compose -f deploy/pdv/compose.yaml pull
sudo docker compose -f deploy/pdv/compose.yaml up -d
sudo docker compose -f deploy/pdv/compose.yaml ps
```

A porta é publicada apenas em `127.0.0.1`. Confirme que ela não aparece em `0.0.0.0`:

```bash
sudo ss -ltnp | grep ':1433'
sudo docker inspect --format '{{.State.Health.Status}}' 4byts-pdv-sqlserver
```

## 5. Compilar e publicar

```bash
cd /var/www/4byts

set -a
. deploy/pdv/frontend.env
set +a
npm ci --prefix pdv/FRONTEND
npm run build:prod --prefix pdv/FRONTEND
unset $(cut -d= -f1 deploy/pdv/frontend.env)

dotnet restore pdv/API/NETCORE/HORUSPDV-API.csproj
dotnet publish pdv/API/NETCORE/HORUSPDV-API.csproj -c Release -o /tmp/4byts-pdv-api-publish

sudo install -d -m 755 /var/www/4byts-pdv/frontend /var/www/4byts-pdv/api
sudo rsync -a --delete pdv/FRONTEND/dist/ /var/www/4byts-pdv/frontend/
sudo rsync -a --delete /tmp/4byts-pdv-api-publish/ /var/www/4byts-pdv/api/
sudo chown -R root:root /var/www/4byts-pdv
sudo chmod -R a=rX /var/www/4byts-pdv
```

## 6. Serviço da API

```bash
sudo cp /var/www/4byts/deploy/pdv/4byts-pdv-api.service /etc/systemd/system/4byts-pdv-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now 4byts-pdv-api
sudo systemctl status 4byts-pdv-api --no-pager
sudo journalctl -u 4byts-pdv-api -n 80 --no-pager
```

Teste localmente simulando o HTTPS informado pelo Nginx:

```bash
curl -H 'Host: pdv.4byts.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:5260/api/health
```

## 7. Nginx e certificado

O arquivo abaixo cria um novo virtual host. Não remova nem desative nenhuma configuração existente.

```bash
sudo cp /var/www/4byts/deploy/pdv/nginx-pdv-4byts.conf /etc/nginx/sites-available/4byts-pdv
if [ ! -e /etc/nginx/sites-enabled/4byts-pdv ]; then
  sudo ln -s /etc/nginx/sites-available/4byts-pdv /etc/nginx/sites-enabled/4byts-pdv
fi
sudo nginx -t
sudo systemctl reload nginx
```

Com o token Cloudflare que já existe em `/root/.secrets/cloudflare.ini`:

```bash
sudo certbot run \
  --authenticator dns-cloudflare \
  --installer nginx \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 60 \
  -d pdv.4byts.com

sudo nginx -t
sudo systemctl reload nginx
curl https://pdv.4byts.com/api/health
```

## Atualizações

Repita a compilação e a sincronização da seção 5, depois:

```bash
sudo systemctl restart 4byts-pdv-api
sudo nginx -t && sudo systemctl reload nginx
```

O volume `4byts_pdv_sqlserver_data` não é removido por atualizações. Nunca execute `docker compose down -v`, pois `-v` apaga o banco persistente.
