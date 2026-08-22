# Deploy do 4Byts Atendimento

O produto roda isoladamente em `127.0.0.1:5280`, usa seu próprio SQLite em `/var/lib/4byts-atendimento/atendimento.db` e responde em `atendimento.4byts.com`. Ele não altera as portas ou bancos do site, PDV, Food ou GriffyStore.

## 1. DNS

No Cloudflare, crie um registro `A` chamado `atendimento`, apontando para o mesmo IP da VPS e com o proxy ativado.

## 2. Central e produto

O preço ainda é uma decisão comercial. O primeiro comando cadastra apenas o produto. Para também criar o plano mensal, substitua `29900` pelo valor escolhido em centavos.

```bash
cd /var/www/4byts
git pull --ff-only origin main
npm ci
npm run build
sudo systemctl restart 4byts-api

sudo -u www-data env DATABASE_PATH=/var/lib/4byts/4byts.db ATENDIMENTO_MONTHLY_PRICE_CENTS=0 npm run setup:atendimento-product

# Execute esta linha somente depois de definir o preço mensal:
# sudo -u www-data env DATABASE_PATH=/var/lib/4byts/4byts.db ATENDIMENTO_MONTHLY_PRICE_CENTS=29900 npm run setup:atendimento-product
```

Depois que o plano existir, gere a licença pelo painel administrativo. Ela terá prefixo `4B-WPP-` e não funcionará no PDV ou Food.

## 3. Serviço isolado

```bash
sudo install -d -m 750 -o www-data -g www-data /var/lib/4byts-atendimento
sudo install -d -m 750 -o root -g www-data /etc/4byts-atendimento

service_key="$(sudo sed -n 's/^LICENSE_SERVICE_API_KEY=//p' /etc/4byts/4byts-api.env | tail -n 1)"
encryption_key="$(openssl rand -hex 48)"
verify_token="$(openssl rand -hex 32)"

if [ ! -f /etc/4byts-atendimento/atendimento.env ]; then
  {
    printf 'NODE_ENV=production\n'
    printf 'ATENDIMENTO_HOST=127.0.0.1\nATENDIMENTO_PORT=5280\n'
    printf 'ATENDIMENTO_DATABASE_PATH=/var/lib/4byts-atendimento/atendimento.db\n'
    printf 'ATENDIMENTO_ENCRYPTION_KEY=%s\n' "$encryption_key"
    printf 'CENTRAL_API_URL=http://127.0.0.1:4310\n'
    printf 'LICENSE_SERVICE_API_KEY=%s\n' "$service_key"
    printf 'WHATSAPP_VERIFY_TOKEN=%s\n' "$verify_token"
    printf 'WHATSAPP_APP_SECRET=COLE_AQUI_O_APP_SECRET_DA_META\n'
    printf 'WHATSAPP_GRAPH_VERSION=v25.0\n'
  } | sudo tee /etc/4byts-atendimento/atendimento.env >/dev/null
fi
sudo chown root:www-data /etc/4byts-atendimento/atendimento.env
sudo chmod 640 /etc/4byts-atendimento/atendimento.env
unset service_key encryption_key verify_token

sudo cp deploy/atendimento/4byts-atendimento.service /etc/systemd/system/4byts-atendimento.service
sudo cp deploy/atendimento/nginx-atendimento-4byts.conf /etc/nginx/sites-available/4byts-atendimento
sudo ln -sfn /etc/nginx/sites-available/4byts-atendimento /etc/nginx/sites-enabled/4byts-atendimento
sudo systemctl daemon-reload
sudo systemctl enable --now 4byts-atendimento
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d atendimento.4byts.com
```

## 4. Meta for Developers

1. Crie um aplicativo empresarial e adicione o produto WhatsApp.
2. Copie o `App Secret` para `WHATSAPP_APP_SECRET` em `/etc/4byts-atendimento/atendimento.env`.
3. Reinicie: `sudo systemctl restart 4byts-atendimento`.
4. Configure o callback como `https://atendimento.4byts.com/webhooks/whatsapp`.
5. Use no painel da Meta o mesmo `WHATSAPP_VERIFY_TOKEN` salvo no arquivo privado.
6. Assine o campo `messages` da conta WhatsApp Business.
7. No painel 4Byts Atendimento, informe Phone Number ID, WABA ID e o token permanente.

Não coloque tokens ou App Secret no Git, em prints ou mensagens.

## 5. Verificação

```bash
curl http://127.0.0.1:5280/api/health
curl https://atendimento.4byts.com/api/health
sudo systemctl status 4byts-atendimento --no-pager
sudo journalctl -u 4byts-atendimento -n 100 --no-pager
```
