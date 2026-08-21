namespace FourByts.Pdv.Desktop;

internal sealed record DeviceIdentity(string Id, string Name)
{
    private const string IdentityFileName = "installation.id";

    public static DeviceIdentity LoadOrCreate()
    {
        var applicationFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "4Byts",
            "Food");
        Directory.CreateDirectory(applicationFolder);

        var identityPath = Path.Combine(applicationFolder, IdentityFileName);
        var storedValue = File.Exists(identityPath) ? File.ReadAllText(identityPath).Trim() : "";
        if (!Guid.TryParse(storedValue, out var installationId))
        {
            installationId = Guid.NewGuid();
            File.WriteAllText(identityPath, installationId.ToString("D"));
        }

        var machineName = Environment.MachineName.Trim();
        return new DeviceIdentity(
            installationId.ToString("D"),
            string.IsNullOrWhiteSpace(machineName) ? "Computador Windows" : machineName);
    }
}
