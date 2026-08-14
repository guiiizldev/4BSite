/**
 * Arquivo: API/NETCORE/Services/Security/HorusClientIpResolver.cs
 * Objetivo: resolver IP do cliente sem confiar em cabeçalhos de proxy por padrão.
 * Entradas esperadas: recebe HttpContext e opções de segurança para auditar e limitar requisições.
 */
namespace HORUSPDV_API.Services.Security;

public static class HorusClientIpResolver
{
    public static string Resolve(HttpContext context, HorusSecurityOptions securityOptions, string fallback = "unknown")
    {
        if (securityOptions.TrustForwardedHeaders)
        {
            var forwarded = context.Request.Headers["X-Forwarded-For"].FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(forwarded))
            {
                return forwarded.Split(',')[0].Trim();
            }
        }

        return context.Connection.RemoteIpAddress?.ToString() ?? fallback;
    }
}
