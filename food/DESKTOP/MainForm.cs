using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FourByts.Pdv.Desktop;

public sealed class MainForm : Form
{
    private static readonly Uri PdvUri = new(Environment.GetEnvironmentVariable("FOURBYTS_FOOD_URL") ?? "https://food.4byts.com");
    private readonly WebView2 webView = new() { Dock = DockStyle.Fill };
    private readonly DeviceIdentity deviceIdentity = DeviceIdentity.LoadOrCreate();

    public MainForm()
    {
        Text = "4Byts Food";
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(1024, 700);
        BackColor = Color.FromArgb(243, 245, 240);
        Controls.Add(webView);
        Shown += async (_, _) => await InitializeBrowserAsync();
    }

    private async Task InitializeBrowserAsync()
    {
        try
        {
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "4Byts", "Food", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder);
            await webView.EnsureCoreWebView2Async(environment);

            var settings = webView.CoreWebView2.Settings;
            settings.AreDevToolsEnabled = false;
            settings.AreDefaultContextMenusEnabled = false;
            settings.IsStatusBarEnabled = false;
            settings.IsZoomControlEnabled = false;
            settings.AreBrowserAcceleratorKeysEnabled = false;

            webView.CoreWebView2.NavigationStarting += OnNavigationStarting;
            webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
            webView.CoreWebView2.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            webView.CoreWebView2.WebResourceRequested += AddDeviceIdentityHeaders;
            webView.CoreWebView2.PermissionRequested += (_, eventArgs) => eventArgs.State = CoreWebView2PermissionState.Deny;
            webView.CoreWebView2.ProcessFailed += (_, _) => BeginInvoke(() => webView.Reload());
            webView.Source = PdvUri;
        }
        catch (WebView2RuntimeNotFoundException)
        {
            ShowStartupError("O Microsoft Edge WebView2 Runtime não está instalado. Instale o Edge atualizado e abra o 4Byts Food novamente.");
        }
        catch (Exception exception)
        {
            ShowStartupError($"Não foi possível abrir o 4Byts Food.\n\n{exception.Message}");
        }
    }

    private void AddDeviceIdentityHeaders(object? sender, CoreWebView2WebResourceRequestedEventArgs eventArgs)
    {
        if (!Uri.TryCreate(eventArgs.Request.Uri, UriKind.Absolute, out var target) ||
            !IsAllowed(target.AbsoluteUri) ||
            !target.AbsolutePath.StartsWith("/api/", StringComparison.OrdinalIgnoreCase)) return;

        eventArgs.Request.Headers.SetHeader("X-4Byts-Device-Id", deviceIdentity.Id);
        eventArgs.Request.Headers.SetHeader("X-4Byts-Device-Name", deviceIdentity.Name);
        eventArgs.Request.Headers.SetHeader("X-4Byts-Client", "4Byts-Food-Desktop");
    }

    private static bool IsAllowed(string rawUrl)
    {
        return Uri.TryCreate(rawUrl, UriKind.Absolute, out var target) &&
               string.Equals(target.Scheme, PdvUri.Scheme, StringComparison.OrdinalIgnoreCase) &&
               string.Equals(target.Host, PdvUri.Host, StringComparison.OrdinalIgnoreCase) &&
               target.Port == PdvUri.Port;
    }

    private static void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs eventArgs)
    {
        if (!IsAllowed(eventArgs.Uri)) eventArgs.Cancel = true;
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs eventArgs)
    {
        eventArgs.Handled = true;
        if (IsAllowed(eventArgs.Uri)) webView.CoreWebView2.Navigate(eventArgs.Uri);
    }

    private void ShowStartupError(string message)
    {
        Controls.Clear();
        Controls.Add(new Label
        {
            Dock = DockStyle.Fill,
            Text = message,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 12),
            ForeColor = Color.FromArgb(70, 82, 77),
            Padding = new Padding(40)
        });
    }
}
