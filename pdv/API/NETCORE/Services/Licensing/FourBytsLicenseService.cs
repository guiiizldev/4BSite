using System.Net.Http.Json;
using System.Text.Json;

namespace HORUSPDV_API.Services.Licensing;

public sealed class FourBytsLicenseService(HttpClient httpClient, FourBytsLicenseOptions options)
{
    public async Task<LicenseActivationResult> ActivateAsync(
        string licenseKey,
        string instanceId,
        string companyName,
        string companyDocument,
        string sourceIp,
        CancellationToken cancellationToken)
    {
        if (!options.Enabled) return LicenseActivationResult.Development();
        using var request = CreateRequest(HttpMethod.Post, "/api/v1/licenses/activate", new
        {
            licenseKey,
            instanceId,
            companyName,
            companyDocument,
            sourceIp
        });
        using var response = await httpClient.SendAsync(request, cancellationToken);
        return await ReadActivationAsync(response, cancellationToken);
    }

    public async Task<LicenseValidationResult> ValidateAsync(string activationToken, string sourceIp, CancellationToken cancellationToken)
    {
        if (!options.Enabled) return LicenseValidationResult.Development();
        using var request = CreateRequest(HttpMethod.Post, "/api/v1/licenses/validate", new { activationToken, sourceIp });
        using var response = await httpClient.SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<CentralLicenseResponse>(cancellationToken: cancellationToken);
        if (response.IsSuccessStatusCode && payload?.Valid == true && payload.License is not null)
            return new LicenseValidationResult(true, "", payload.License);
        var error = payload?.Error ?? (string.IsNullOrWhiteSpace(payload?.Status)
            ? "Licença inválida."
            : $"Licença {payload.Status}.");
        return new LicenseValidationResult(false, error, payload?.License);
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string path, object body)
    {
        var request = new HttpRequestMessage(method, $"{options.BaseUrl}{path}") { Content = JsonContent.Create(body) };
        request.Headers.Add("x-4byts-service-key", options.ServiceKey);
        return request;
    }

    private static async Task<LicenseActivationResult> ReadActivationAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        CentralLicenseResponse? payload = null;
        try { payload = JsonSerializer.Deserialize<CentralLicenseResponse>(raw, JsonOptions); } catch (JsonException) { }
        if (response.IsSuccessStatusCode && payload?.ActivationToken is not null && payload.License is not null)
            return new LicenseActivationResult(true, "", payload.ActivationToken, payload.License);
        return new LicenseActivationResult(false, payload?.Error ?? "Não foi possível ativar a licença.", "", payload?.License);
    }

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
}

public sealed record CentralLicenseDto(int Id, string Product, string Plan, string Status, int MaxDevices, DateTimeOffset? ExpiresAt);
public sealed record LicenseActivationResult(bool Success, string Error, string ActivationToken, CentralLicenseDto? License)
{
    public static LicenseActivationResult Development() => new(true, "", "development", new(0, "4Byts PDV", "Desenvolvimento", "active", 1, null));
}
public sealed record LicenseValidationResult(bool Valid, string Error, CentralLicenseDto? License)
{
    public static LicenseValidationResult Development() => new(true, "", new(0, "4Byts PDV", "Desenvolvimento", "active", 1, null));
}
public sealed class CentralLicenseResponse
{
    public bool Valid { get; set; }
    public string? Error { get; set; }
    public string? Status { get; set; }
    public string? ActivationToken { get; set; }
    public CentralLicenseDto? License { get; set; }
}
