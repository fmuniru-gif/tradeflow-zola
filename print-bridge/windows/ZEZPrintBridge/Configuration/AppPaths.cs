namespace ZEZPrintBridge.Configuration;

public sealed class AppPaths
{
    public AppPaths(string? baseDirectory = null)
    {
        BaseDirectory = baseDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ZEZMS", "ZEZPrintBridge");
        Directory.CreateDirectory(BaseDirectory);
    }

    public string BaseDirectory { get; }
    public string ConfigFile => Path.Combine(BaseDirectory, "bridge-config.json");
    public string PairedDevicesFile => Path.Combine(BaseDirectory, "paired-devices.protected");
    public string JobsFile => Path.Combine(BaseDirectory, "recent-jobs.json");
    public string LogFile => Path.Combine(BaseDirectory, "bridge.log");
    public string WebViewDataDirectory => Path.Combine(BaseDirectory, "WebView2");
}
