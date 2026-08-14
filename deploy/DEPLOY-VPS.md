# Publicação na VPS Linux

Configuração recomendada para Ubuntu ou Debian, com Nginx e certificado HTTPS gratuito do Let's Encrypt. Esta implantação usa uma pasta e um virtual host exclusivos para a 4Byts e pode coexistir com a GriffyStore na mesma VPS.

> Não remova nem altere os arquivos Nginx da GriffyStore. O site da 4Byts deve ser adicionado como uma configuração independente.

## Recuperação caso o `default` já tenha sido desativado

O comando `unlink /etc/nginx/sites-enabled/default` remove apenas o link de ativação. Se ele já foi executado, restaure o link somente quando o arquivo original existir:

```bash
if [ -f /etc/nginx/sites-available/default ] && [ ! -e /etc/nginx/sites-enabled/default ]; then
  sudo ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
fi

sudo nginx -t && sudo systemctl reload nginx
```

Se a GriffyStore não utilizava o arquivo `default`, restaurá-lo pode não ser necessário. Confira os domínios e arquivos ativos com:

```bash
sudo grep -R "server_name" /etc/nginx/sites-enabled
sudo ls -la /etc/nginx/sites-enabled
```

## 1. Configure o DNS

No provedor do domínio, crie estes registros apontando para o IP público da VPS:

| Tipo | Nome | Valor |
| --- | --- | --- |
| A | `@` | `IP_DA_VPS` |
| A | `www` | `IP_DA_VPS` |

Espere a propagação do DNS antes de solicitar o certificado HTTPS.

## 2. Prepare a VPS

```bash
sudo apt update
sudo apt install -y nginx git curl certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo mkdir -p /var/www/4byts
sudo chown -R "$USER":"$USER" /var/www/4byts
```

Antes de alterar o Nginx, registre as configurações existentes:

```bash
sudo nginx -T > "$HOME/nginx-antes-4byts.txt"
sudo ls -la /etc/nginx/sites-enabled
sudo nginx -t
```

## 3. Baixe e compile o site

```bash
git clone https://github.com/guiiizldev/4BSite.git /var/www/4byts
cd /var/www/4byts
npm ci
npm run build
```

## 4. Configure o Nginx

```bash
sudo cp /var/www/4byts/deploy/nginx-4byts.conf /etc/nginx/sites-available/4byts

if [ ! -e /etc/nginx/sites-enabled/4byts ]; then
  sudo ln -s /etc/nginx/sites-available/4byts /etc/nginx/sites-enabled/4byts
fi

sudo nginx -t && sudo systemctl reload nginx
```

Não desative o site `default` nem qualquer configuração da GriffyStore sem antes confirmar a qual domínio ela atende. Configurações Nginx com `server_name` diferentes funcionam simultaneamente nas mesmas portas 80 e 443.

## 5. Ative HTTPS

Execute somente depois de `4byts.com` e `www.4byts.com` apontarem para a VPS:

```bash
sudo certbot --nginx -d 4byts.com -d www.4byts.com
sudo certbot renew --dry-run
```

O Certbot deve modificar somente o bloco de servidor de `4byts.com`. Depois da emissão, valide todos os sites antes de recarregar:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 6. Portal do cliente e banco próprio

O portal usa uma API exclusiva em `127.0.0.1:4310` e um banco próprio em `/var/lib/4byts/4byts.db`. Nada é compartilhado com a GriffyStore.

```bash
sudo mkdir -p /var/lib/4byts
sudo chown -R www-data:www-data /var/lib/4byts
sudo chmod 750 /var/lib/4byts

sudo cp /var/www/4byts/deploy/4byts-api.service /etc/systemd/system/4byts-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now 4byts-api
sudo systemctl status 4byts-api --no-pager
curl http://127.0.0.1:4310/api/health
```

Como o Certbot já adicionou HTTPS, não substitua agora o arquivo Nginx inteiro. Adicione manualmente o bloco `location /api/` de `deploy/nginx-4byts.conf` dentro do bloco HTTPS existente em `/etc/nginx/sites-available/4byts`.

```bash
sudo nginx -t && sudo systemctl reload nginx
curl https://4byts.com/api/health
```

Crie a primeira conta administrativa:

```bash
cd /var/www/4byts
sudo -u www-data env DATABASE_PATH=/var/lib/4byts/4byts.db node server/create-admin.js
```

## Atualizações futuras

```bash
cd /var/www/4byts
git pull --ff-only
npm ci
npm run build
sudo systemctl restart 4byts-api
sudo nginx -t
sudo systemctl reload nginx
```

O site público continua estático. Apenas a API do portal permanece ativa, isolada na porta local `4310`.
