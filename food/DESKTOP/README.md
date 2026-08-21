# 4Byts PDV Desktop

Aplicativo Windows leve, construído em .NET 8 e Microsoft Edge WebView2. Abre somente `https://pdv.4byts.com`, sem barra de endereço, ferramentas de desenvolvedor ou navegação para domínios externos.

Cada instalação recebe um identificador UUID persistente em `%LOCALAPPDATA%\4Byts\PDV\installation.id`. O aplicativo envia esse identificador somente às rotas `/api/` do domínio oficial, permitindo que a central de licenças diferencie computadores no mesmo IP público. Excluir esse arquivo faz a máquina ser reconhecida como uma nova instalação e exigir nova aprovação.

## Compilar

```powershell
dotnet restore
dotnet build -c Release
```

## Gerar versão para distribuição

```powershell
dotnet publish -c Release -r win-x64 --self-contained true -o publish
```

O executável será `publish/4Byts.PDV.exe`. O computador do cliente precisa do Microsoft Edge WebView2 Runtime, normalmente já presente no Windows 10 e 11.

Na primeira ativação feita pelo aplicativo, a instalação aparecerá no portal administrativo com o nome do computador Windows. O administrador deve aprovar a máquina e o IP antes do primeiro acesso.

Para desenvolvimento, é possível apontar para outro endereço:

```powershell
$env:FOURBYTS_PDV_URL='http://localhost:5173'
dotnet run
```
