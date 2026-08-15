# Cobrança recorrente 4Byts com Asaas

## 1. Ambiente Sandbox

Crie uma conta no Sandbox do Asaas e gere uma chave de API. Na VPS, acrescente ao arquivo `/etc/4byts/4byts-api.env`:

```dotenv
ASAAS_API_URL=https://api-sandbox.asaas.com/v3
ASAAS_API_KEY=SUA_CHAVE_DA_API_SANDBOX
ASAAS_WEBHOOK_TOKEN=GERE_UM_TOKEN_FORTE_COM_PELO_MENOS_32_CARACTERES
LICENSE_REQUIRE_IP_APPROVAL=true
```

O token de webhook não deve ser igual à chave da API.

## 2. Webhook

No painel Asaas, configure a URL:

```text
https://4byts.com/api/webhooks/asaas
```

Use exatamente o mesmo valor de `ASAAS_WEBHOOK_TOKEN` como token de autenticação. Habilite os eventos de cobrança, especialmente criação, confirmação, recebimento, vencimento, estorno e chargeback.

## 3. Produção

Depois da homologação, troque somente:

```dotenv
ASAAS_API_URL=https://api.asaas.com/v3
ASAAS_API_KEY=SUA_CHAVE_DA_API_DE_PRODUCAO
```

Mantenha o token secreto fora do Git e reinicie `4byts-api` após alterar o arquivo de ambiente.

## Regras implementadas

- Cobrança recorrente por Pix ou boleto.
- QR Code Pix, Copia e Cola, link da fatura e boleto no portal.
- Webhooks idempotentes.
- Carência até o fim do quinto dia após o vencimento.
- Bloqueio automático no sexto dia.
- Reativação automática assim que o pagamento é confirmado/recebido.
- Licenças antigas permanecem isentas até receberem uma assinatura.
- Nova máquina e novo IP exigem aprovação administrativa.
