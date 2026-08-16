using ZEZPrintBridge.Models;

namespace ZEZPrintBridge.Printing;

public sealed class MockPrintRenderer : IPrintRenderer
{
    public bool IsInitialized { get; private set; }
    public string InitializationError => string.Empty;
    public Task InitializeAsync(CancellationToken cancellationToken = default) { IsInitialized = true; return Task.CompletedTask; }
    public async Task<PrintResult> PrintAsync(string html, string printerName, int copies, CancellationToken cancellationToken)
    {
        await Task.Delay(30, cancellationToken);
        return new PrintResult("printed", "Simulated print completed in explicit QA mode.");
    }
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
