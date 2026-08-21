# Deploy separado do 4Byts Food

O Food usa o mesmo SQL Server privado já instalado para o PDV, mas cria o banco lógico independente `FourBytsFood`. Não abra outro container SQL na VPS. O serviço roda em `127.0.0.1:5270`, publica em `/var/www/4byts-food` e responde somente por `food.4byts.com`.

## DNS

No Cloudflare, crie um registro `A` de nome `food` apontando para o IP da VPS, com proxy ativado.

## Primeiro deploy

Depois de atualizar o repositório, confirme que o PDV e o SQL Server atuais estão saudáveis. Então crie a configuração privada do Food. O comando reutiliza a senha do SQL já existente sem mostrá-la na tela e reutiliza apenas a credencial interna da central; as licenças continuam separadas pelo `ProductCode=food`.

```bash
cd /var/www/4byts
git pull --ff-only origin main

# Atualiza a central e cadastra o Food + plano mensal de R$ 350.
npm ci
npm run build
sudo systemctl restart 4byts-api
sudo -u www-data env DATABASE_PATH=/var/lib/4byts/4byts.db npm run setup:food-plan
sudo systemctl restart 4byts-api

sudo install -d -m 750 -o root -g www-data /etc/4byts-food
service_key="$(sudo sed -n 's/^LICENSE_SERVICE_API_KEY=//p' /etc/4byts/4byts-api.env | tail -n 1)"
sql_password="$(sudo sed -n 's/^MSSQL_SA_PASSWORD=//p' /etc/4byts-pdv/sqlserver.env | tail -n 1)"
jwt_secret="$(openssl rand -hex 48)"
encryption_key="$(openssl rand -hex 48)"

if [ ! -f /etc/4byts-food/food-api.env ]; then
  {
    printf 'ASPNETCORE_ENVIRONMENT=Production\nASPNETCORE_URLS=http://127.0.0.1:5270\n'
    printf 'HORUSPDV_CONNECTION_STRING="Server=127.0.0.1,1433;Database=FourBytsFood;User Id=sa;Password=%s;Encrypt=True;TrustServerCertificate=True;MultipleActiveResultSets=True"\n' "$sql_password"
    printf 'Auth__JwtSecret=%s\nAuth__Issuer=4byts-food-api\nAuth__Audience=4byts-food-web\n' "$jwt_secret"
    printf 'Security__EncryptionKey=%s\nSecurity__CorsOrigins=https://food.4byts.com\nSecurity__TrustForwardedHeaders=true\n' "$encryption_key"
    printf 'Licensing__Enabled=true\nLicensing__BaseUrl=http://127.0.0.1:4310\nLicensing__ServiceKey=%s\nLicensing__ProductCode=food\n' "$service_key"
    printf 'Recaptcha__Enabled=false\nEmail__Enabled=false\n'
  } | sudo tee /etc/4byts-food/food-api.env >/dev/null
fi
sudo chown root:www-data /etc/4byts-food/food-api.env
sudo chmod 640 /etc/4byts-food/food-api.env
unset service_key sql_password jwt_secret encryption_key

set -a
. deploy/food/frontend.env
set +a
npm ci --prefix food/FRONTEND
npm run build:prod --prefix food/FRONTEND
dotnet publish food/API/NETCORE/HORUSPDV-API.csproj -c Release -o /tmp/4byts-food-api-publish

sudo install -d -m 755 /var/www/4byts-food/frontend /var/www/4byts-food/api
sudo rsync -a --delete food/FRONTEND/dist/ /var/www/4byts-food/frontend/
sudo rsync -rltD --delete /tmp/4byts-food-api-publish/ /var/www/4byts-food/api/
sudo chown -R root:root /var/www/4byts-food
sudo chmod -R a=rX /var/www/4byts-food

sudo cp deploy/food/4byts-food-api.service /etc/systemd/system/4byts-food-api.service
sudo cp deploy/food/nginx-food-4byts.conf /etc/nginx/sites-available/4byts-food
sudo ln -sfn /etc/nginx/sites-available/4byts-food /etc/nginx/sites-enabled/4byts-food
sudo systemctl daemon-reload
sudo systemctl enable --now 4byts-food-api
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d food.4byts.com
```

## Verificação

```bash
curl http://127.0.0.1:5270/api/health
curl https://food.4byts.com/api/health
sudo systemctl status 4byts-food-api --no-pager
```

O script `setup:food-plan` cadastra o produto `4Byts Food` separado do PDV e o plano `FOOD PREMIUM`, código `food-mensal`, por R$ 350,00 mensais. Ele pode ser executado novamente sem duplicar registros. A chave gerada terá prefixo `4B-FOOD-` e será recusada pelo PDV comum. Da mesma forma, uma chave `4B-PDV-` será recusada pelo Food.
