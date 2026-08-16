using System.Threading.Channels;
using ZEZPrintBridge.Configuration;
using ZEZPrintBridge.Models;
using ZEZPrintBridge.Printing;

namespace ZEZPrintBridge.Services;

public sealed class PrintQueueService : IAsyncDisposable
{
    private readonly Channel<PrintEnvelope> _channel = Channel.CreateUnbounded<PrintEnvelope>(new UnboundedChannelOptions { SingleReader = true, SingleWriter = false });
    private readonly ConfigurationStore _config;
    private readonly JobStore _jobs;
    private readonly IPrintRenderer _renderer;
    private readonly MetadataLogger _logger;
    private readonly bool _mockMode;
    private readonly CancellationTokenSource _shutdown = new();
    private Task? _processor;

    public PrintQueueService(ConfigurationStore config, JobStore jobs, IPrintRenderer renderer, MetadataLogger logger, bool mockMode = false)
    {
        _config = config;
        _jobs = jobs;
        _renderer = renderer;
        _logger = logger;
        _mockMode = mockMode;
    }

    public void Start() => _processor ??= Task.Run(ProcessAsync);
    public ValueTask QueueAsync(PrintEnvelope envelope) => _channel.Writer.WriteAsync(envelope, _shutdown.Token);

    private async Task ProcessAsync()
    {
        await foreach (var envelope in _channel.Reader.ReadAllAsync(_shutdown.Token))
        {
            var request = envelope.Request;
            var printer = _config.Current.SelectedPrinter;
            var availability = _mockMode && printer.StartsWith("ZEZMS Mock", StringComparison.Ordinal)
                ? (Configured:true, Ready:true, Message:"QA mock printer ready")
                : PrinterCatalog.Check(printer);
            if (!availability.Configured || !availability.Ready)
            {
                _jobs.Update(request.JobId, "printer-unavailable", availability.Message, printer);
                _logger.Write("print-finished", request.JobId, request.DocumentType, "printer-unavailable", printer);
                continue;
            }
            try
            {
                _jobs.Update(request.JobId, "rendering", "Rendering the A5 document in isolated WebView2.", printer);
                _logger.Write("print-rendering", request.JobId, request.DocumentType, "rendering", printer);
                await _renderer.InitializeAsync(_shutdown.Token);
                if (!_renderer.IsInitialized)
                {
                    _jobs.Update(request.JobId, "failed", _renderer.InitializationError, printer);
                    _logger.Write("print-finished", request.JobId, request.DocumentType, "renderer-unavailable", printer);
                    continue;
                }
                _jobs.Update(request.JobId, "printing", "Sending the A5 document to the selected Windows printer.", printer);
                var result = await _renderer.PrintAsync(request.Html, printer, request.Copies, _shutdown.Token);
                _jobs.Update(request.JobId, result.Status, result.Message, printer);
                _logger.Write("print-finished", request.JobId, request.DocumentType, result.Status, printer);
            }
            catch (OperationCanceledException) when (_shutdown.IsCancellationRequested) { break; }
            catch (Exception error)
            {
                _jobs.Update(request.JobId, "failed", "Print processing failed: " + error.Message, printer);
                _logger.Write("print-finished", request.JobId, request.DocumentType, "failed", printer);
            }
            finally
            {
                request.Html = string.Empty;
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        _channel.Writer.TryComplete();
        _shutdown.Cancel();
        if (_processor is not null) try { await _processor; } catch (OperationCanceledException) { }
        await _renderer.DisposeAsync();
        _shutdown.Dispose();
    }
}
