# 4Byts PDV

Plataforma de frente de caixa e gestão operacional da 4Byts para pequenos e médios comércios.

## Estado atual

O produto está em desenvolvimento e ainda não deve ser utilizado em produção. A primeira fase de rebranding e a integração técnica com a central de licenças 4Byts foram concluídas.

Funcionalidades disponíveis na base atual:

- autenticação, sessões e recuperação de senha;
- cadastro de empresas e usuários;
- clientes, fornecedores, produtos e estoque;
- abertura e fechamento de caixa;
- frente de caixa, vendas e histórico;
- relatórios e configurações da empresa;
- separação de dados por empresa.

Os módulos fiscal NFC-e/NF-e e pagamentos integrados permanecem em desenvolvimento.

## Arquitetura

- `FRONTEND`: React 19, TypeScript, Vite e Tailwind CSS;
- `API/NETCORE`: ASP.NET Core 8;
- banco operacional: SQL Server;
- licenciamento e clientes: API central da plataforma `4byts.com`, com ativação por CNPJ, limite de instalações, validação periódica e tolerância offline.

## Licenciamento

O cadastro de uma empresa exige uma chave ativa e vinculada a um cliente no painel 4Byts. O navegador nunca recebe o segredo da integração: a API do PDV se comunica diretamente com a central, armazena somente o token de ativação criptografado e renova a validação periodicamente.

Para habilitar o fluxo comercial, configure a API .NET por variáveis de ambiente:

```bash
Licensing__Enabled=true
Licensing__BaseUrl=http://127.0.0.1:4310
Licensing__ServiceKey=O_MESMO_SEGREDO_FORTE_DA_CENTRAL
Security__EncryptionKey=UMA_CHAVE_FORTE_E_ESTAVEL_PARA_CRIPTOGRAFIA
```

Na API central do site, configure `LICENSE_SERVICE_API_KEY` com o mesmo segredo de no mínimo 32 caracteres. Em desenvolvimento, `Licensing:Enabled` permanece desativado por padrão.

## Validação

```bash
cd FRONTEND
npm ci
npm run lint
npm run build:prod

cd ../API/NETCORE
dotnet restore
dotnet build HORUSPDV-API.sln
```

## Origem e licença

O 4Byts PDV utiliza como base o projeto open source [Hórus PDV](https://github.com/oliveiradeflavio/horus_pdv), criado por Flávio Oliveira e disponibilizado sob licença MIT.

O aviso de copyright e o texto integral da licença original estão preservados no arquivo [LICENSE](./LICENSE), conforme exigido para cópias ou partes substanciais do software.

As novas integrações, identidade visual, infraestrutura, central de licenças e módulos desenvolvidos pela 4Byts compõem a evolução comercial deste produto.
