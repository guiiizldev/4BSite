namespace HORUSPDV_API.Services.Licensing;

public sealed class FourBytsLicenseOptions(IConfiguration configuration, IWebHostEnvironment environment)
{
    public bool Enabled { get; } = bool.TryParse(configuration["Licensing:Enabled"], out var enabled) && enabled;
    public string BaseUrl { get; } = configuration["Licensing:BaseUrl"]?.TrimEnd('/') ?? "http://127.0.0.1:4310";
    public string ServiceKey { get; } = configuration["Licensing:ServiceKey"] ?? "";
    public string ProductCode { get; } = (configuration["Licensing:ProductCode"] ?? "pdv").Trim().ToLowerInvariant();
    public int ValidationMinutes { get; } = int.TryParse(configuration["Licensing:ValidationMinutes"], out var minutes)
        ? Math.Clamp(minutes, 1, 1440)
        : 15;
    public int GraceHours { get; } = int.TryParse(configuration["Licensing:GraceHours"], out var hours)
        ? Math.Clamp(hours, 1, 168)
        : 72;

    public void Validate()
    {
        if (!Enabled) return;
        if (!Uri.TryCreate(BaseUrl, UriKind.Absolute, out _))
            throw new InvalidOperationException("Licensing:BaseUrl inválida.");
        if (ServiceKey.Length < 32)
            throw new InvalidOperationException("Licensing:ServiceKey deve possuir pelo menos 32 caracteres.");
        if (ProductCode is not ("pdv" or "food"))
            throw new InvalidOperationException("Licensing:ProductCode deve ser 'pdv' ou 'food'.");
        if (environment.IsProduction() && !BaseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase) &&
            !BaseUrl.StartsWith("http://127.0.0.1", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("A central de licenças deve usar HTTPS ou conexão local na produção.");
    }
}
