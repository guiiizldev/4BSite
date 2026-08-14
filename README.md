# 4Byts — Site institucional e comercial

Primeira versão da presença digital da 4Byts, criada para apresentar o portfólio, vender produtos como o 4Byts PDV, receber pedidos de sistemas sob medida e introduzir a futura central de licenciamento.

## Executar localmente

```bash
npm install
npm run dev
```

Para gerar a versão de produção:

```bash
npm run build
```

## O que já está pronto

- Landing page institucional responsiva
- Apresentação do 4Byts PDV e soluções sob medida
- Simulação de planos mensal e anual
- Formulário comercial com máscara de WhatsApp
- Portal funcional com cadastro, login e sessões seguras
- Banco próprio da 4Byts para clientes, licenças e dispositivos
- Consulta e vínculo de licenças por chave
- Painel administrativo para clientes, permissões e licenças
- Gerenciamento de instalações com último acesso, IP, liberação remota e histórico de auditoria
- API de ativação e validação de licenças para os produtos 4Byts
- Integração do 4Byts PDV com licença vinculada ao CNPJ e token criptografado
- Apresentação do fluxo de licenciamento
- Menu mobile, modais, feedbacks e animações
- Base inicial do 4Byts PDV em `pdv/`

## 4Byts PDV

O diretório `pdv/` contém a evolução comercial do sistema de frente de caixa, com frontend React/TypeScript, API ASP.NET Core e banco SQL Server. O produto está em desenvolvimento e ainda não deve ser publicado em produção.

A homologação isolada em `pdv.4byts.com` está documentada em [`deploy/pdv/DEPLOY-HOMOLOG.md`](./deploy/pdv/DEPLOY-HOMOLOG.md). Execute primeiro o verificador de recursos para não afetar os outros sistemas da VPS.

## Próximas fases

Os preços e pagamentos ainda são demonstrativos. A autenticação e a base de licenças já possuem backend próprio. As próximas fases devem conectar:

- gateway de pagamento e assinaturas;
- ampliação dos testes de segurança e isolamento multiempresa;
- envio de leads por WhatsApp, e-mail ou CRM;
- recuperação de senha por e-mail e verificação de conta.
