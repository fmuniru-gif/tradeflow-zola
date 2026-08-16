using System.Text.Json;
using ZEZPrintBridge.Models;

namespace ZEZPrintBridge.Configuration;

public sealed class ConfigurationStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly object _gate = new();
    private readonly AppPaths _paths;
    private BridgeConfig _current;

    public ConfigurationStore(AppPaths paths)
    {
        _paths = paths;
        _current = LoadFromDisk();
    }

    public BridgeConfig Current
    {
        get { lock (_gate) return Clone(_current); }
    }

    public void Save(BridgeConfig config)
    {
        var normalized = Normalize(config);
        lock (_gate)
        {
            WriteAtomic(_paths.ConfigFile, JsonSerializer.SerializeToUtf8Bytes(normalized, JsonOptions));
            _current = normalized;
        }
    }

    private BridgeConfig LoadFromDisk()
    {
        try
        {
            if (File.Exists(_paths.ConfigFile))
                return Normalize(JsonSerializer.Deserialize<BridgeConfig>(File.ReadAllBytes(_paths.ConfigFile)) ?? new());
        }
        catch { }
        return new BridgeConfig();
    }

    private static BridgeConfig Normalize(BridgeConfig input)
    {
        var origins = (input.AllowedOrigins ?? [])
            .Select(NormalizeOrigin)
            .Where(value => value is not null)
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToList();
        return new BridgeConfig
        {
            Port = input.Port is >= 1024 and <= 65535 ? input.Port : BridgeConstants.DefaultPort,
            LanEnabled = input.LanEnabled,
            StartWithWindows = input.StartWithWindows,
            SelectedPrinter = (input.SelectedPrinter ?? string.Empty).Trim(),
            AllowedOrigins = origins
        };
    }

    private static string? NormalizeOrigin(string? input)
    {
        if (!Uri.TryCreate((input ?? string.Empty).Trim(), UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme is not ("https" or "http") || uri.UserInfo.Length > 0 || uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment)) return null;
        return uri.GetLeftPart(UriPartial.Authority);
    }

    private static BridgeConfig Clone(BridgeConfig source) => new()
    {
        Port = source.Port,
        LanEnabled = source.LanEnabled,
        StartWithWindows = source.StartWithWindows,
        SelectedPrinter = source.SelectedPrinter,
        AllowedOrigins = [.. source.AllowedOrigins]
    };

    internal static void WriteAtomic(string path, byte[] content)
    {
        var temp = path + ".tmp";
        File.WriteAllBytes(temp, content);
        File.Move(temp, path, true);
    }
}
