using HORUSPDV_API.Repositories.DatabaseAccess;

namespace HORUSPDV_API.Services.Licensing;

public sealed class FourBytsLicenseGuard(
    FourBytsLicenseStore store,
    FourBytsLicenseService service,
    FourBytsLicenseOptions options,
    ILogger<FourBytsLicenseGuard> logger)
{
    public async Task<LicenseAccessResult> CheckAsync(string companyId, CancellationToken cancellationToken)
    {
        if (!options.Enabled) return LicenseAccessResult.Allowed("development");
        var local = store.Get(companyId);
        if (local is null) return LicenseAccessResult.Denied("Empresa sem licença 4Byts ativada.");
        var now = DateTimeOffset.UtcNow;
        if (local.Status == "active" && local.ExpiresAt is not null && local.ExpiresAt <= now)
            return LicenseAccessResult.Denied("A licença 4Byts está vencida.");
        if (local.Status != "active")
        {
            var message = local.Status == "activation_removed"
                ? "Esta instalação foi liberada pelo administrador. Ative o PDV novamente."
                : $"A licença 4Byts está {local.Status}.";
            return LicenseAccessResult.Denied(message);
        }
        if (local.LastValidatedAt.AddMinutes(options.ValidationMinutes) > now)
            return LicenseAccessResult.Allowed(local.Plan);

        try
        {
            var validation = await service.ValidateAsync(local.ActivationToken, cancellationToken);
            if (validation.License is not null)
            {
                // Persist revogações e vencimentos imediatamente. Isso impede que uma
                // licença recusada pela central volte a entrar no período de tolerância.
                store.SaveValidation(companyId, validation.License);
            }
            if (!validation.Valid || validation.License is null)
            {
                if (validation.License is null) store.MarkActivationInvalid(companyId);
                return LicenseAccessResult.Denied(validation.Error);
            }
            return LicenseAccessResult.Allowed(validation.License.Plan);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(ex, "Central de licenças indisponível para a empresa {CompanyId}.", companyId);
            return local.GraceUntil > now
                ? LicenseAccessResult.Allowed(local.Plan, true)
                : LicenseAccessResult.Denied("Não foi possível validar a licença após o período de tolerância.");
        }
    }
}

public sealed record LicenseAccessResult(bool IsAllowed, string Message, string Plan, bool IsGracePeriod)
{
    public static LicenseAccessResult Allowed(string plan, bool grace = false) => new(true, "", plan, grace);
    public static LicenseAccessResult Denied(string message) => new(false, message, "", false);
}
