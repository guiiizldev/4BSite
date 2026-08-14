using HORUSPDV_API.Models.Response;
using HORUSPDV_API.Repositories.DatabaseAccess;
using HORUSPDV_API.Services.Security;
using Microsoft.AspNetCore.Mvc;

namespace HORUSPDV_API.Controllers.License;

[ApiController]
[Route("api/[controller]")]
public sealed class LicenseController(FourBytsLicenseStore licenseStore) : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        if (HttpContext.Items["CurrentUser"] is not AuthenticatedUser currentUser)
            return Unauthorized(new ApiResponse<object> { Success = false, Message = "Sessão não encontrada." });

        var license = licenseStore.Get(currentUser.CompanyId);
        if (license is null)
            return NotFound(new ApiResponse<object> { Success = false, Message = "Licença 4Byts não encontrada." });

        return Ok(new ApiResponse<object>
        {
            Success = true,
            Message = "Licença obtida com sucesso.",
            Data = new
            {
                license.LicenseId,
                license.Product,
                license.Plan,
                license.Status,
                license.MaxDevices,
                license.ExpiresAt,
                license.LastValidatedAt,
                license.GraceUntil
            }
        });
    }
}
