using HORUSPDV_API.Models.Requests;
using HORUSPDV_API.Models.Response;
using HORUSPDV_API.Repositories.DatabaseAccess;
using HORUSPDV_API.Services.Security;
using Microsoft.AspNetCore.Mvc;

namespace HORUSPDV_API.Controllers.Restaurant;

[ApiController]
[Route("api/restaurant")]
public sealed class RestaurantController(RestaurantAB restaurant) : ControllerBase
{
    [HttpGet("tables")]
    public async Task<IActionResult> ListTables()
    {
        if (!TryGetUser(out var user)) return UnauthorizedResponse();
        return Ok(Success("Mesas carregadas.", await restaurant.ListTablesAsync(user.CompanyId)));
    }

    [HttpPost("tables")]
    public async Task<IActionResult> CreateTable([FromBody] CreateRestaurantTableRequest request)
        => await Run(async user => Created("", Success("Mesa criada.", await restaurant.CreateTableAsync(user.CompanyId, request))));

    [HttpPost("tabs/open")]
    public async Task<IActionResult> OpenTab([FromBody] OpenRestaurantTabRequest request)
        => await Run(async user => Ok(Success("Comanda aberta.", await restaurant.OpenTabAsync(user.CompanyId, request, user))));

    [HttpGet("tabs/{tabId}")]
    public async Task<IActionResult> GetTab(string tabId)
        => await Run(async user =>
        {
            var tab = await restaurant.GetTabAsync(user.CompanyId, tabId);
            return tab is null ? NotFound(Failure("Comanda não encontrada.")) : Ok(Success("Comanda carregada.", tab));
        });

    [HttpPost("tabs/{tabId}/items")]
    public async Task<IActionResult> AddItem(string tabId, [FromBody] AddRestaurantTabItemRequest request)
        => await Run(async user => Ok(Success("Item adicionado à comanda.", await restaurant.AddItemAsync(user.CompanyId, tabId, request))));

    [HttpPatch("tabs/{tabId}/items/{itemId}/status")]
    public async Task<IActionResult> UpdateItemStatus(string tabId, string itemId, [FromBody] UpdateRestaurantTabItemStatusRequest request)
        => await Run(async user => Ok(Success("Status do item atualizado.", await restaurant.UpdateItemStatusAsync(user.CompanyId, tabId, itemId, request.Status))));

    [HttpPost("tabs/{tabId}/close")]
    public async Task<IActionResult> CloseTab(string tabId)
        => await Run(async user => Ok(Success("Comanda encerrada e mesa liberada.", await restaurant.CloseTabAsync(user.CompanyId, tabId))));

    private bool TryGetUser(out AuthenticatedUser user)
    {
        user = HttpContext.Items["CurrentUser"] as AuthenticatedUser ?? new AuthenticatedUser();
        return !string.IsNullOrWhiteSpace(user.Id);
    }

    private IActionResult UnauthorizedResponse() => Unauthorized(Failure("Sessão não encontrada."));

    private async Task<IActionResult> Run(Func<AuthenticatedUser, Task<IActionResult>> action)
    {
        if (!TryGetUser(out var user)) return UnauthorizedResponse();
        try { return await action(user); }
        catch (InvalidOperationException ex) { return BadRequest(Failure(ex.Message)); }
    }

    private static ApiResponse<T> Success<T>(string message, T data) => new() { Success = true, Message = message, Data = data };
    private static ApiResponse<object> Failure(string message) => new() { Success = false, Message = message };
}
