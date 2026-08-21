using HORUSPDV_API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace HORUSPDV_API.Controllers.Health;

[ApiController]
[Route("api/[controller]")]
public sealed class HealthController(Connection connection) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        await using var database = await connection.OpenConnectionAsync(cancellationToken);
        await using var command = new SqlCommand("SELECT 1;", database);
        await command.ExecuteScalarAsync(cancellationToken);
        return Ok(new { status = "ok", service = "4byts-pdv-api", database = "ok", time = DateTimeOffset.UtcNow });
    }
}
