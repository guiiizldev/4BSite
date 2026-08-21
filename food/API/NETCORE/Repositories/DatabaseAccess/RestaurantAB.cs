using System.Globalization;
using HORUSPDV_API.Models.Requests;
using HORUSPDV_API.Services.Security;
using Microsoft.Data.SqlClient;

namespace HORUSPDV_API.Repositories.DatabaseAccess;

public sealed class RestaurantAB(Connection connection)
{
    public async Task<IReadOnlyList<RestaurantTableDto>> ListTablesAsync(string companyId)
    {
        const string sql = """
            SELECT t.Id, t.Name, t.Capacity, t.Status,
                   tab.Id AS TabId, tab.Number AS TabNumber, tab.CustomerName, tab.GuestCount, tab.OpenedAt,
                   COALESCE(SUM(CASE WHEN item.Status <> N'cancelled' THEN item.Quantity * item.UnitPrice ELSE 0 END), 0) AS Total
              FROM RestaurantTables t
              LEFT JOIN RestaurantTabs tab ON tab.TableId = t.Id AND tab.CompanyId = t.CompanyId AND tab.Status = N'open'
              LEFT JOIN RestaurantTabItems item ON item.TabId = tab.Id AND item.CompanyId = t.CompanyId
             WHERE t.CompanyId = @CompanyId
             GROUP BY t.Id, t.Name, t.Capacity, t.Status, tab.Id, tab.Number, tab.CustomerName, tab.GuestCount, tab.OpenedAt
             ORDER BY TRY_CONVERT(INT, t.Name), t.Name;
            """;
        await using var db = await connection.OpenConnectionAsync();
        await using var command = new SqlCommand(sql, db);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<RestaurantTableDto>();
        while (await reader.ReadAsync())
        {
            rows.Add(new RestaurantTableDto(
                reader.GetString(0), reader.GetString(1), reader.GetInt32(2), reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetInt32(5),
                reader.IsDBNull(6) ? null : reader.GetString(6),
                reader.IsDBNull(7) ? null : reader.GetInt32(7),
                reader.IsDBNull(8) ? null : reader.GetDateTimeOffset(8),
                reader.GetDecimal(9)));
        }
        return rows;
    }

    public async Task<RestaurantTableDto> CreateTableAsync(string companyId, CreateRestaurantTableRequest request)
    {
        var id = $"mesa-{Guid.NewGuid():N}";
        await using var db = await connection.OpenConnectionAsync();
        await using var command = new SqlCommand("""
            INSERT INTO RestaurantTables (Id, CompanyId, Name, Capacity)
            VALUES (@Id, @CompanyId, @Name, @Capacity);
            """, db);
        command.Parameters.AddWithValue("@Id", id);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@Name", request.Name.Trim());
        command.Parameters.AddWithValue("@Capacity", request.Capacity);
        try { await command.ExecuteNonQueryAsync(); }
        catch (SqlException ex) when (ex.Number is 2601 or 2627)
        {
            throw new InvalidOperationException("Já existe uma mesa com esse nome.");
        }
        return (await ListTablesAsync(companyId)).Single(item => item.Id == id);
    }

    public async Task<RestaurantTabDetailsDto> OpenTabAsync(string companyId, OpenRestaurantTabRequest request, AuthenticatedUser user)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var transaction = (SqlTransaction)await db.BeginTransactionAsync();
        try
        {
            await using var lockCommand = new SqlCommand("""
                SELECT Status FROM RestaurantTables WITH (UPDLOCK, HOLDLOCK)
                 WHERE Id = @TableId AND CompanyId = @CompanyId;
                """, db, transaction);
            lockCommand.Parameters.AddWithValue("@TableId", request.TableId);
            lockCommand.Parameters.AddWithValue("@CompanyId", companyId);
            var tableStatus = await lockCommand.ExecuteScalarAsync() as string;
            if (tableStatus is null) throw new InvalidOperationException("Mesa não encontrada.");
            if (tableStatus != "available") throw new InvalidOperationException("Esta mesa não está disponível.");

            await using var numberCommand = new SqlCommand("SELECT ISNULL(MAX(Number), 0) + 1 FROM RestaurantTabs WITH (UPDLOCK, HOLDLOCK) WHERE CompanyId = @CompanyId;", db, transaction);
            numberCommand.Parameters.AddWithValue("@CompanyId", companyId);
            var number = Convert.ToInt32(await numberCommand.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
            var id = $"cmd-{Guid.NewGuid():N}"[..36];

            await using var insert = new SqlCommand("""
                INSERT INTO RestaurantTabs (Id, CompanyId, TableId, Number, CustomerName, GuestCount, Notes, OpenedById, OpenedByName)
                VALUES (@Id, @CompanyId, @TableId, @Number, @CustomerName, @GuestCount, @Notes, @UserId, @UserName);
                UPDATE RestaurantTables SET Status = N'occupied', UpdatedAt = SYSDATETIMEOFFSET()
                 WHERE Id = @TableId AND CompanyId = @CompanyId;
                """, db, transaction);
            insert.Parameters.AddWithValue("@Id", id);
            insert.Parameters.AddWithValue("@CompanyId", companyId);
            insert.Parameters.AddWithValue("@TableId", request.TableId);
            insert.Parameters.AddWithValue("@Number", number);
            insert.Parameters.AddWithValue("@CustomerName", string.IsNullOrWhiteSpace(request.CustomerName) ? "Consumidor" : request.CustomerName.Trim());
            insert.Parameters.AddWithValue("@GuestCount", request.GuestCount);
            insert.Parameters.AddWithValue("@Notes", request.Notes.Trim());
            insert.Parameters.AddWithValue("@UserId", user.Id);
            insert.Parameters.AddWithValue("@UserName", user.Name);
            await insert.ExecuteNonQueryAsync();
            await transaction.CommitAsync();
            return await GetTabAsync(companyId, id) ?? throw new InvalidOperationException("Não foi possível abrir a comanda.");
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<RestaurantTabDetailsDto?> GetTabAsync(string companyId, string tabId)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var tabCommand = new SqlCommand("""
            SELECT tab.Id, tab.Number, tab.TableId, t.Name, tab.CustomerName, tab.GuestCount, tab.Status, tab.Notes, tab.OpenedByName, tab.OpenedAt, tab.ClosedAt
              FROM RestaurantTabs tab LEFT JOIN RestaurantTables t ON t.Id = tab.TableId
             WHERE tab.Id = @TabId AND tab.CompanyId = @CompanyId;
            """, db);
        tabCommand.Parameters.AddWithValue("@TabId", tabId);
        tabCommand.Parameters.AddWithValue("@CompanyId", companyId);
        await using var reader = await tabCommand.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        var dto = new RestaurantTabDetailsDto
        {
            Id = reader.GetString(0), Number = reader.GetInt32(1), TableId = reader.IsDBNull(2) ? null : reader.GetString(2),
            TableName = reader.IsDBNull(3) ? "Balcão" : reader.GetString(3), CustomerName = reader.GetString(4),
            GuestCount = reader.GetInt32(5), Status = reader.GetString(6), Notes = reader.GetString(7),
            OpenedByName = reader.GetString(8), OpenedAt = reader.GetDateTimeOffset(9),
            ClosedAt = reader.IsDBNull(10) ? null : reader.GetDateTimeOffset(10)
        };
        await reader.CloseAsync();

        await using var itemCommand = new SqlCommand("""
            SELECT Id, ProductId, ProductName, Quantity, UnitPrice, Status, Notes, CreatedAt
              FROM RestaurantTabItems WHERE TabId = @TabId AND CompanyId = @CompanyId ORDER BY CreatedAt;
            """, db);
        itemCommand.Parameters.AddWithValue("@TabId", tabId);
        itemCommand.Parameters.AddWithValue("@CompanyId", companyId);
        await using var itemReader = await itemCommand.ExecuteReaderAsync();
        while (await itemReader.ReadAsync())
        {
            dto.Items.Add(new RestaurantTabItemDto(
                itemReader.GetString(0), itemReader.IsDBNull(1) ? null : itemReader.GetString(1), itemReader.GetString(2),
                itemReader.GetDecimal(3), itemReader.GetDecimal(4), itemReader.GetString(5), itemReader.GetString(6), itemReader.GetDateTimeOffset(7)));
        }
        dto.Total = dto.Items.Where(item => item.Status != "cancelled").Sum(item => item.Quantity * item.UnitPrice);
        return dto;
    }

    public async Task<RestaurantTabDetailsDto> AddItemAsync(string companyId, string tabId, AddRestaurantTabItemRequest request)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var command = new SqlCommand("""
            SELECT p.ProductName, p.ProductSalePrice
              FROM Produtos p
             WHERE p.Id = @ProductId AND p.CompanyId = @CompanyId
               AND EXISTS (SELECT 1 FROM RestaurantTabs tab WHERE tab.Id = @TabId AND tab.CompanyId = @CompanyId AND tab.Status = N'open');
            """, db);
        command.Parameters.AddWithValue("@ProductId", request.ProductId);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@TabId", tabId);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) throw new InvalidOperationException("Produto não encontrado ou comanda já encerrada.");
        var productName = reader.GetString(0);
        var unitPrice = ParseMoney(reader.GetString(1));
        await reader.CloseAsync();

        await using var insert = new SqlCommand("""
            INSERT INTO RestaurantTabItems (Id, CompanyId, TabId, ProductId, ProductName, Quantity, UnitPrice, Notes)
            VALUES (@Id, @CompanyId, @TabId, @ProductId, @ProductName, @Quantity, @UnitPrice, @Notes);
            """, db);
        insert.Parameters.AddWithValue("@Id", $"item-{Guid.NewGuid():N}"[..37]);
        insert.Parameters.AddWithValue("@CompanyId", companyId);
        insert.Parameters.AddWithValue("@TabId", tabId);
        insert.Parameters.AddWithValue("@ProductId", request.ProductId);
        insert.Parameters.AddWithValue("@ProductName", productName);
        insert.Parameters.AddWithValue("@Quantity", request.Quantity);
        insert.Parameters.AddWithValue("@UnitPrice", unitPrice);
        insert.Parameters.AddWithValue("@Notes", request.Notes.Trim());
        await insert.ExecuteNonQueryAsync();
        return await GetTabAsync(companyId, tabId) ?? throw new InvalidOperationException("Comanda não encontrada.");
    }

    public async Task<RestaurantTabDetailsDto> UpdateItemStatusAsync(string companyId, string tabId, string itemId, string status)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var command = new SqlCommand("""
            UPDATE RestaurantTabItems SET Status = @Status, UpdatedAt = SYSDATETIMEOFFSET()
             WHERE Id = @ItemId AND TabId = @TabId AND CompanyId = @CompanyId;
            """, db);
        command.Parameters.AddWithValue("@Status", status);
        command.Parameters.AddWithValue("@ItemId", itemId);
        command.Parameters.AddWithValue("@TabId", tabId);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        if (await command.ExecuteNonQueryAsync() == 0) throw new InvalidOperationException("Item não encontrado.");
        return await GetTabAsync(companyId, tabId) ?? throw new InvalidOperationException("Comanda não encontrada.");
    }

    public async Task<RestaurantTabDetailsDto> CloseTabAsync(string companyId, string tabId)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var transaction = (SqlTransaction)await db.BeginTransactionAsync();
        await using var command = new SqlCommand("""
            DECLARE @TableId NVARCHAR(40);
            SELECT @TableId = TableId FROM RestaurantTabs WITH (UPDLOCK) WHERE Id = @TabId AND CompanyId = @CompanyId AND Status = N'open';
            IF @TableId IS NULL THROW 51000, N'Comanda não encontrada ou já encerrada.', 1;
            UPDATE RestaurantTabs SET Status = N'closed', ClosedAt = SYSDATETIMEOFFSET() WHERE Id = @TabId AND CompanyId = @CompanyId;
            UPDATE RestaurantTables SET Status = N'available', UpdatedAt = SYSDATETIMEOFFSET() WHERE Id = @TableId AND CompanyId = @CompanyId;
            """, db, transaction);
        command.Parameters.AddWithValue("@TabId", tabId);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        try
        {
            await command.ExecuteNonQueryAsync();
            await transaction.CommitAsync();
        }
        catch (SqlException ex) when (ex.Number == 51000)
        {
            await transaction.RollbackAsync();
            throw new InvalidOperationException(ex.Message);
        }
        return await GetTabAsync(companyId, tabId) ?? throw new InvalidOperationException("Comanda não encontrada.");
    }

    private static decimal ParseMoney(string value)
    {
        var normalized = value.Trim().Replace("R$", "", StringComparison.OrdinalIgnoreCase).Replace(".", "").Replace(",", ".");
        return decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0;
    }
}

public sealed record RestaurantTableDto(string Id, string Name, int Capacity, string Status, string? OpenTabId, int? OpenTabNumber, string? CustomerName, int? GuestCount, DateTimeOffset? OpenedAt, decimal Total);
public sealed record RestaurantTabItemDto(string Id, string? ProductId, string ProductName, decimal Quantity, decimal UnitPrice, string Status, string Notes, DateTimeOffset CreatedAt);
public sealed class RestaurantTabDetailsDto
{
    public string Id { get; set; } = "";
    public int Number { get; set; }
    public string? TableId { get; set; }
    public string TableName { get; set; } = "";
    public string CustomerName { get; set; } = "";
    public int GuestCount { get; set; }
    public string Status { get; set; } = "";
    public string Notes { get; set; } = "";
    public string OpenedByName { get; set; } = "";
    public DateTimeOffset OpenedAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public decimal Total { get; set; }
    public List<RestaurantTabItemDto> Items { get; set; } = [];
}
