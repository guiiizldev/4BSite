# 4Byts PDV

Plataforma de frente de caixa e gestão operacional da 4Byts para pequenos e médios comércios.

## Estado atual

O produto está em desenvolvimento e ainda não deve ser utilizado em produção. A primeira fase de rebranding foi concluída e a integração com a central de licenças 4Byts está em preparação.

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
- licenciamento e clientes: integração futura com a plataforma `4byts.com`.

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
