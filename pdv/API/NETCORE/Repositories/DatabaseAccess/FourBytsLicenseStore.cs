using HORUSPDV_API.Repositories;
using HORUSPDV_API.Services.Licensing;
using HORUSPDV_API.Services.Security;
using Microsoft.Data.SqlClient;

namespace HORUSPDV_API.Repositories.DatabaseAccess;

public sealed class FourBytsLicenseStore(Connection connection, HorusSecretProtector protector, FourBytsLicenseOptions options)
{
    public void SaveActivation(string companyId, LicenseActivationResult activation)
    {
        if (!options.Enabled || !activation.Success || activation.License is null) return;
        var now = DateTimeOffset.UtcNow;
        using var db = connection.OpenConnection();
        using var command = new SqlCommand(
            """
            MERGE Licencas4Byts AS target
            USING (SELECT @CompanyId AS CompanyId) AS source ON target.CompanyId = source.CompanyId
            WHEN MATCHED THEN UPDATE SET LicenseId = @LicenseId, Product = @Product, PlanName = @PlanName,
                Status = @Status, MaxDevices = @MaxDevices, ExpiresAt = @ExpiresAt,
                ActivationTokenEncrypted = @Token, LastValidatedAt = @Now, GraceUntil = @GraceUntil, UpdatedAt = @Now
            WHEN NOT MATCHED THEN INSERT
                (CompanyId, LicenseId, Product, PlanName, Status, MaxDevices, ExpiresAt, ActivationTokenEncrypted, LastValidatedAt, GraceUntil, UpdatedAt)
                VALUES (@CompanyId, @LicenseId, @Product, @PlanName, @Status, @MaxDevices, @ExpiresAt, @Token, @Now, @GraceUntil, @Now);
            """,
            db);
        AddLicenseParameters(command, companyId, activation.License, protector.Protect(activation.ActivationToken), now);
        command.ExecuteNonQuery();
    }

    public CompanyLicenseRecord? Get(string companyId)
    {
        if (!options.Enabled) return CompanyLicenseRecord.Development(companyId);
        using var db = connection.OpenConnection();
        using var command = new SqlCommand(
            "SELECT CompanyId, LicenseId, Product, PlanName, Status, MaxDevices, ExpiresAt, ActivationTokenEncrypted, LastValidatedAt, GraceUntil FROM Licencas4Byts WHERE CompanyId = @CompanyId;",
            db);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        using var reader = command.ExecuteReader();
        if (!reader.Read()) return null;
        return new CompanyLicenseRecord(
            reader.GetString(0), reader.GetInt32(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetInt32(5),
            reader.IsDBNull(6) ? null : reader.GetDateTimeOffset(6), protector.Unprotect(reader.GetString(7)), reader.GetDateTimeOffset(8), reader.GetDateTimeOffset(9));
    }

    public void SaveValidation(string companyId, CentralLicenseDto license)
    {
        if (!options.Enabled) return;
        var now = DateTimeOffset.UtcNow;
        using var db = connection.OpenConnection();
        using var command = new SqlCommand(
            """
            UPDATE Licencas4Byts SET Product = @Product, PlanName = @PlanName, Status = @Status,
                MaxDevices = @MaxDevices, ExpiresAt = @ExpiresAt, LastValidatedAt = @Now,
                GraceUntil = @GraceUntil, UpdatedAt = @Now WHERE CompanyId = @CompanyId;
            """,
            db);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@Product", license.Product);
        command.Parameters.AddWithValue("@PlanName", license.Plan);
        command.Parameters.AddWithValue("@Status", license.Status);
        command.Parameters.AddWithValue("@MaxDevices", license.MaxDevices);
        command.Parameters.AddWithValue("@ExpiresAt", license.ExpiresAt is null ? DBNull.Value : license.ExpiresAt.Value);
        command.Parameters.AddWithValue("@Now", now);
        command.Parameters.AddWithValue("@GraceUntil", now.AddHours(options.GraceHours));
        command.ExecuteNonQuery();
    }

    private void AddLicenseParameters(SqlCommand command, string companyId, CentralLicenseDto license, string token, DateTimeOffset now)
    {
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@LicenseId", license.Id);
        command.Parameters.AddWithValue("@Product", license.Product);
        command.Parameters.AddWithValue("@PlanName", license.Plan);
        command.Parameters.AddWithValue("@Status", license.Status);
        command.Parameters.AddWithValue("@MaxDevices", license.MaxDevices);
        command.Parameters.AddWithValue("@ExpiresAt", license.ExpiresAt is null ? DBNull.Value : license.ExpiresAt.Value);
        command.Parameters.AddWithValue("@Token", token);
        command.Parameters.AddWithValue("@Now", now);
        command.Parameters.AddWithValue("@GraceUntil", now.AddHours(options.GraceHours));
    }
}

public sealed record CompanyLicenseRecord(string CompanyId, int LicenseId, string Product, string Plan, string Status,
    int MaxDevices, DateTimeOffset? ExpiresAt, string ActivationToken, DateTimeOffset LastValidatedAt, DateTimeOffset GraceUntil)
{
    public static CompanyLicenseRecord Development(string companyId) => new(companyId, 0, "4Byts PDV", "Desenvolvimento", "active", 1, null, "development", DateTimeOffset.UtcNow, DateTimeOffset.MaxValue);
}
