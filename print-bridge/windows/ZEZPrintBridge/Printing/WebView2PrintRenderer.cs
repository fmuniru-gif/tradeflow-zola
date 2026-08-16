using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using ZEZPrintBridge.Configuration;
using ZEZPrintBridge.Models;

namespace ZEZPrintBridge.Printing;

public sealed class WebView2PrintRenderer : IPrintRenderer
{
    private readonly Control _uiOwner;
    private readonly AppPaths _paths;
    private WebView2? _webView;
    private bool _initializing;
    public bool IsInitialized { get; private set; }
    public string InitializationError { get; private set; } = string.Empty;

    public WebView2PrintRenderer(Control uiOwner, AppPaths paths)
    {
        _uiOwner = uiOwner;
        _paths = paths;
    }

    public Task InitializeAsync(CancellationToken cancellationToken = default) => OnUiAsync(async () =>
    {
        if (IsInitialized || _initializing) return;
        _initializing = true;
        try
        {
            _ = CoreWebView2Environment.GetAvailableBrowserVersionString();
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: _paths.WebViewDataDirectory);
            _webView = new WebView2 { Visible = false, Size = new Size(1200, 1700) };
            _uiOwner.Controls.Add(_webView);
            await _webView.EnsureCoreWebView2Async(environment);
            var settings = _webView.CoreWebView2.Settings;
            settings.IsScriptEnabled = false;
            settings.AreHostObjectsAllowed = false;
            settings.IsWebMessageEnabled = false;
            settings.AreDevToolsEnabled = false;
            settings.AreDefaultContextMenusEnabled = false;
            settings.AreDefaultScriptDialogsEnabled = false;
            settings.IsGeneralAutofillEnabled = false;
            settings.IsPasswordAutosaveEnabled = false;
            _webView.CoreWebView2.NavigationStarting += (_, args) =>
            {
                if (!string.Equals(args.Uri, "about:blank", StringComparison.OrdinalIgnoreCase)) args.Cancel = true;
            };
            _webView.CoreWebView2.FrameNavigationStarting += (_, args) => args.Cancel = true;
            _webView.CoreWebView2.NewWindowRequested += (_, args) => args.Handled = true;
            _webView.CoreWebView2.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            _webView.CoreWebView2.WebResourceRequested += (_, args) =>
            {
                if (args.Request.Uri.StartsWith("http:", StringComparison.OrdinalIgnoreCase)
                    || args.Request.Uri.StartsWith("https:", StringComparison.OrdinalIgnoreCase)
                    || args.Request.Uri.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
                {
                    args.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(null, 403, "Blocked", "Content-Type: text/plain");
                }
            };
            IsInitialized = true;
            InitializationError = string.Empty;
        }
        catch (Exception error)
        {
            InitializationError = "Microsoft Edge WebView2 Runtime is unavailable or could not initialize: " + error.Message;
            IsInitialized = false;
        }
        finally { _initializing = false; }
    });

    public Task<PrintResult> PrintAsync(string html, string printerName, int copies, CancellationToken cancellationToken) => OnUiAsync(async () =>
    {
        await InitializeAsync(cancellationToken);
        if (!IsInitialized || _webView?.CoreWebView2 is null) return new PrintResult("failed", InitializationError);
        var navigation = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        void Completed(object? sender, CoreWebView2NavigationCompletedEventArgs args) => navigation.TrySetResult(args.IsSuccess);
        _webView.CoreWebView2.NavigationCompleted += Completed;
        try
        {
            _webView.NavigateToString(html);
            var completed = await navigation.Task.WaitAsync(TimeSpan.FromSeconds(12), cancellationToken);
            if (!completed) return new PrintResult("failed", "WebView2 could not render the printable document.");
            await Task.Delay(350, cancellationToken);
            var printSettings = _webView.CoreWebView2.Environment.CreatePrintSettings();
            printSettings.PrinterName = printerName;
            printSettings.Copies = Math.Clamp(copies, 1, 5);
            printSettings.Orientation = CoreWebView2PrintOrientation.Portrait;
            printSettings.MediaSize = CoreWebView2PrintMediaSize.Custom;
            printSettings.PageWidth = 148d / 25.4d;
            printSettings.PageHeight = 210d / 25.4d;
            printSettings.MarginTop = 0;
            printSettings.MarginBottom = 0;
            printSettings.MarginLeft = 0;
            printSettings.MarginRight = 0;
            printSettings.ShouldPrintBackgrounds = true;
            printSettings.ShouldPrintHeaderAndFooter = false;
            printSettings.PagesPerSide = 1;
            var status = await _webView.CoreWebView2.PrintAsync(printSettings);
            return status switch
            {
                CoreWebView2PrintStatus.Succeeded => new PrintResult("printed", "Windows accepted the silent print job."),
                CoreWebView2PrintStatus.PrinterUnavailable => new PrintResult("printer-unavailable", "Selected Windows printer is unavailable, offline or in an error state."),
                _ => new PrintResult("failed", "WebView2 returned a print error: " + status)
            };
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception error) { return new PrintResult("failed", "WebView2 print failed: " + error.Message); }
        finally { _webView.CoreWebView2.NavigationCompleted -= Completed; }
    });

    private Task OnUiAsync(Func<Task> action)
    {
        if (!_uiOwner.InvokeRequired) return action();
        var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _uiOwner.BeginInvoke(new Action(async () =>
        {
            try { await action(); completion.SetResult(); }
            catch (Exception error) { completion.SetException(error); }
        }));
        return completion.Task;
    }

    private Task<T> OnUiAsync<T>(Func<Task<T>> action)
    {
        if (!_uiOwner.InvokeRequired) return action();
        var completion = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _uiOwner.BeginInvoke(new Action(async () =>
        {
            try { completion.SetResult(await action()); }
            catch (Exception error) { completion.SetException(error); }
        }));
        return completion.Task;
    }

    public async ValueTask DisposeAsync()
    {
        if (_webView is null) return;
        await OnUiAsync(() => { _webView.Dispose(); _webView = null; return Task.CompletedTask; });
    }
}
