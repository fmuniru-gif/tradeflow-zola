using ZEZPrintBridge.Models;

namespace ZEZPrintBridge.Printing;

public interface IPrintRenderer : IAsyncDisposable
{
    bool IsInitialized { get; }
    string InitializationError { get; }
    Task InitializeAsync(CancellationToken cancellationToken = default);
    Task<PrintResult> PrintAsync(string html, string printerName, int copies, CancellationToken cancellationToken);
}
