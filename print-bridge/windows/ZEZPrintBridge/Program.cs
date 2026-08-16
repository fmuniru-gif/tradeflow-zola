using ZEZPrintBridge.UI;

namespace ZEZPrintBridge;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        using var mutex = new Mutex(true, "Local\\ZEZMS-ZEZPrintBridge-v1", out var isFirstInstance);
        if (!isFirstInstance)
        {
            MessageBox.Show("ZEZ Print Bridge is already running in the Windows notification area.", "ZEZ Print Bridge", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        ApplicationConfiguration.Initialize();
        var mockMode = args.Contains("--mock-printer", StringComparer.OrdinalIgnoreCase);
        var minimized = args.Contains("--minimized", StringComparer.OrdinalIgnoreCase);
        Application.Run(new BridgeApplicationContext(mockMode, minimized));
    }
}
