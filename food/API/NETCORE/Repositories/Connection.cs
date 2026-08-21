/**
 * Arquivo: API/NETCORE/Repositories/Connection.cs
 * Objetivo: centraliza a criação de conexões SQL Server usadas pelos repositórios da API.
 * Entradas esperadas: espera configuração de connection string válida para abrir conexões com o banco.
 */
using Microsoft.Data.SqlClient;

namespace HORUSPDV_API.Repositories;

public sealed class Connection(IConfiguration configuration)
{
    public string ConnectionString { get; } = ResolveConnectionString(configuration);

    public async Task<SqlConnection> OpenConnectionAsync(
        CancellationToken cancellationToken = default,
        string? database = null)
    {
        var connectionString = string.IsNullOrWhiteSpace(database)
            ? ConnectionString
            : BuildConnectionString(database);
        var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }

    public SqlConnection OpenConnection(string? database = null)
    {
        var connectionString = string.IsNullOrWhiteSpace(database)
            ? ConnectionString
            : BuildConnectionString(database);
        var connection = new SqlConnection(connectionString);
        connection.Open();
        return connection;
    }

    private string BuildConnectionString(string database)
    {
        var builder = new SqlConnectionStringBuilder(ConnectionString)
        {
            InitialCatalog = database
        };
        return builder.ConnectionString;
    }

    private static string ResolveConnectionString(IConfiguration configuration)
    {
        var connectionString =
            FirstNonEmpty(
                configuration.GetConnectionString("HorusPdv"),
                configuration.GetConnectionString("DefaultConnection"),
                Environment.GetEnvironmentVariable("SQLCONNSTR_HorusPdv"),
                Environment.GetEnvironmentVariable("SQLCONNSTR_DefaultConnection"),
                Environment.GetEnvironmentVariable("HORUSPDV_CONNECTION_STRING"));

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Connection string não configurada. Defina ConnectionStrings:HorusPdv ou HORUSPDV_CONNECTION_STRING.");
        }

        return connectionString;
    }

    private static string? FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
}
