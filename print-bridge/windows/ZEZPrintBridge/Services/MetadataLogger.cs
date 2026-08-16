using System.Text;
using ZEZPrintBridge.Configuration;

namespace ZEZPrintBridge.Services;

public sealed class MetadataLogger
{
    private readonly object _gate = new();
    private readonly string _path;

    public MetadataLogger(AppPaths paths) => _path = paths.LogFile;

    public void Write(string eventName, string? jobId = null, string? documentType = null, string? result = null, string? printerName = null)
    {
        var clean = new[] { DateTimeOffset.Now.ToString("O"), Clean(eventName), Clean(jobId), Clean(documentType), Clean(result), Clean(printerName) };
        lock (_gate)
        {
            if (File.Exists(_path) && new FileInfo(_path).Length > 2 * 1024 * 1024)
                File.Move(_path, _path + ".previous", true);
            File.AppendAllText(_path, string.Join('\t', clean) + Environment.NewLine, Encoding.UTF8);
        }
    }

    private static string Clean(string? value) => (value ?? string.Empty).Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ')[..Math.Min(180, (value ?? string.Empty).Length)];
}
