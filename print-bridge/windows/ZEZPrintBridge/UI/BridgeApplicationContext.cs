using ZEZPrintBridge.Api;
using ZEZPrintBridge.Configuration;
using ZEZPrintBridge.Printing;
using ZEZPrintBridge.Security;
using ZEZPrintBridge.Services;

namespace ZEZPrintBridge.UI;

public sealed class BridgeApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _tray;
    private readonly Form _rendererHost;
    private readonly SettingsForm _settings;
    private readonly BridgeApiHost _api;
    private bool _exiting;

    public BridgeApplicationContext(bool mockMode, bool startMinimized)
    {
        var paths = new AppPaths();
        var config = new ConfigurationStore(paths);
        var pairing = new PairingStore(paths);
        var jobs = new JobStore(paths);
        var logger = new MetadataLogger(paths);
        _rendererHost = new Form { ShowInTaskbar = false, FormBorderStyle = FormBorderStyle.None, Opacity = 0, Size = new Size(1, 1), StartPosition = FormStartPosition.Manual, Location = new Point(-32000, -32000) };
        _rendererHost.Show();
        _rendererHost.Hide();
        IPrintRenderer renderer = mockMode ? new MockPrintRenderer() : new WebView2PrintRenderer(_rendererHost, paths);
        var queue = new PrintQueueService(config, jobs, renderer, logger, mockMode);
        _api = new BridgeApiHost(config, pairing, jobs, queue, logger);
        _settings = new SettingsForm(config, pairing, jobs, mockMode);
        _tray = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "ZEZ Print Bridge - Starting",
            Visible = true,
            ContextMenuStrip = BuildMenu()
        };
        _tray.DoubleClick += (_, _) => ShowSettings();
        _ = StartApiAsync();
        if (!startMinimized) ShowSettings();
    }

    private ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open ZEZ Print Bridge", null, (_, _) => ShowSettings());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => ExitThread());
        return menu;
    }

    private async Task StartApiAsync()
    {
        try
        {
            await _api.StartAsync();
            _tray.Text = "ZEZ Print Bridge - Ready";
            _tray.ShowBalloonTip(2500, "ZEZ Print Bridge", "Bridge is running. Open settings to select a printer and pair devices.", ToolTipIcon.Info);
            _settings.RefreshStatus();
        }
        catch (Exception error)
        {
            _tray.Text = "ZEZ Print Bridge - Error";
            _tray.ShowBalloonTip(5000, "ZEZ Print Bridge could not start", error.Message, ToolTipIcon.Error);
            ShowSettings();
            MessageBox.Show(_settings, error.Message, "Bridge startup failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void ShowSettings()
    {
        if (!_settings.Visible) _settings.Show();
        if (_settings.WindowState == FormWindowState.Minimized) _settings.WindowState = FormWindowState.Normal;
        _settings.BringToFront();
        _settings.Activate();
    }

    protected override void ExitThreadCore()
    {
        if (_exiting) return;
        _exiting = true;
        _tray.Visible = false;
        _api.DisposeAsync().AsTask().GetAwaiter().GetResult();
        _settings.PermitClose();
        _rendererHost.Dispose();
        _tray.Dispose();
        base.ExitThreadCore();
    }
}
