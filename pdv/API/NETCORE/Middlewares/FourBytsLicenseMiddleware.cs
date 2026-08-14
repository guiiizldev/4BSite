using HORUSPDV_API.Models.Response;
using HORUSPDV_API.Services.Licensing;
using HORUSPDV_API.Services.Security;

namespace HORUSPDV_API.Middlewares;

public sealed class FourBytsLicenseMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, FourBytsLicenseGuard guard)
    {
        // Mantém o diagnóstico acessível para uma sessão existente,
        // inclusive quando a central acabou de suspender ou revogar o acesso.
        if (context.Request.Path.StartsWithSegments("/api/License"))
        {
            await next(context);
            return;
        }

        if (context.Items["CurrentUser"] is not AuthenticatedUser currentUser)
        {
            await next(context);
            return;
        }

        var result = await guard.CheckAsync(currentUser.CompanyId, context.RequestAborted);
        if (!result.IsAllowed)
        {
            context.Response.StatusCode = StatusCodes.Status402PaymentRequired;
            await context.Response.WriteAsJsonAsync(new ApiResponse<object>
            {
                Success = false,
                Message = result.Message,
                Data = new { licenseRequired = true }
            });
            return;
        }

        context.Items["LicensePlan"] = result.Plan;
        context.Items["LicenseGracePeriod"] = result.IsGracePeriod;
        await next(context);
    }
}
