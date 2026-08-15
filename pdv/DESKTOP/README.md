# 4Byts PDV Desktop

Aplicativo Windows leve, construído em .NET 8 e Microsoft Edge WebView2. Abre somente `https://pdv.4byts.com`, sem barra de endereço, ferramentas de desenvolvedor ou navegação para domínios externos.

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

Para desenvolvimento, é possível apontar para outro endereço:

```powershell
$env:FOURBYTS_PDV_URL='http://localhost:5173'
dotnet run
```
