using ZEZPrintBridge.Api;
using ZEZPrintBridge.Configuration;
using ZEZPrintBridge.Printing;
using ZEZPrintBridge.Security;
using ZEZPrintBridge.Services;

namespace ZEZPrintBridge.UI;

public sealed class SettingsForm : Form
{
    private readonly ConfigurationStore _config;
    private readonly PairingStore _pairing;
    private readonly JobStore _jobs;
    private readonly bool _mockMode;
    private readonly ComboBox _printers = new() { DropDownStyle = ComboBoxStyle.DropDownList, Anchor = AnchorStyles.Left | AnchorStyles.Right };
    private readonly NumericUpDown _port = new() { Minimum = 1024, Maximum = 65535, Value = BridgeConstants.DefaultPort };
    private readonly CheckBox _lan = new() { Text = "Enable LAN access for paired phones/tablets", AutoSize = true };
    private readonly CheckBox _startup = new() { Text = "Start ZEZ Print Bridge with Windows", AutoSize = true };
    private readonly TextBox _origins = new() { Multiline = true, Height = 58, ScrollBars = ScrollBars.Vertical, Anchor = AnchorStyles.Left | AnchorStyles.Right };
    private readonly Label _bridgeStatus = ValueLabel();
    private readonly Label _printerStatus = ValueLabel();
    private readonly Label _computerName = ValueLabel();
    private readonly Label _lanAddress = ValueLabel();
    private readonly Label _listening = ValueLabel();
    private readonly Label _pairingStatus = ValueLabel();
    private readonly Label _lastPrint = ValueLabel();
    private readonly Label _autoStart = ValueLabel();
    private readonly Label _pairingCode = new() { Text = "No active code", AutoSize = true, Font = new Font("Segoe UI", 20, FontStyle.Bold), ForeColor = Color.DarkSlateBlue };
    private readonly Label _pairingExpiry = new() { Text = "Generate a temporary code when a device is ready to pair.", AutoSize = true };
    private readonly Label _restartNotice = new() { AutoSize = true, ForeColor = Color.DarkGoldenrod, MaximumSize = new Size(680, 0) };
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 2500 };
    private bool _reallyClose;

    public SettingsForm(ConfigurationStore config, PairingStore pairing, JobStore jobs, bool mockMode)
    {
        _config = config; _pairing = pairing; _jobs = jobs; _mockMode = mockMode;
        Text = "ZEZ Print Bridge";
        AccessibleName = "ZEZ Print Bridge settings";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(720, 690);
        Size = new Size(780, 760);
        AutoScroll = true;
        Font = new Font("Segoe UI", 9F);
        BuildUi();
        LoadConfiguration();
        RefreshStatus();
        _timer.Tick += (_, _) => RefreshStatus();
        _timer.Start();
        FormClosing += (_, args) => { if (!_reallyClose) { args.Cancel = true; Hide(); } };
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 2, Padding = new Padding(18), AutoScroll = false };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 38));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 62));
        Controls.Add(root);
        AddHeading(root, "ZEZ Print Bridge", "Silent A5 printing for ZEZMS receipts, invoices and waybills. Normal use does not require Administrator privileges.");
        AddRow(root, "Bridge Status", _bridgeStatus);
        AddRow(root, "Selected Printer", _printerStatus);
        AddRow(root, "Local Computer Name", _computerName);
        AddRow(root, "LAN IPv4 Address", _lanAddress);
        AddRow(root, "Listening Port", _listening);
        AddRow(root, "Pairing Status", _pairingStatus);
        AddRow(root, "Last Print Result", _lastPrint);
        AddRow(root, "Auto-start Status", _autoStart);

        AddSection(root, "Printer and listener settings");
        AddRow(root, "ZEZMS Default Printer", _printers);
        AddRow(root, "Listening Port", _port);
        AddFull(root, _lan);
        AddFull(root, _startup);
        AddRow(root, "Allowed production origin(s)", _origins);
        AddFull(root, new Label { Text = "Enter the exact GitHub Pages origin, for example https://account.github.io. One origin per line. Wildcards are never used. Restart the bridge after listener, port or LAN changes.", AutoSize = true, ForeColor = Color.DimGray, MaximumSize = new Size(680, 0) });
        var save = new Button { Text = "Save Bridge Settings", AutoSize = true, AccessibleName = "Save Bridge Settings" };
        save.Click += (_, _) => SaveConfiguration();
        AddFull(root, save);
        AddFull(root, _restartNotice);

        AddSection(root, "Pair Mobile Device or Desktop Browser");
        AddFull(root, _pairingCode);
        AddFull(root, _pairingExpiry);
        var buttons = new FlowLayoutPanel { AutoSize = true, WrapContents = true };
        var generate = new Button { Text = "Generate 6-digit Pairing Code", AutoSize = true };
        generate.Click += (_, _) => GeneratePairingCode();
        var revoke = new Button { Text = "Revoke All Paired Devices", AutoSize = true };
        revoke.Click += (_, _) => RevokeAll();
        var refresh = new Button { Text = "Refresh Printers", AutoSize = true };
        refresh.Click += (_, _) => LoadPrinters(_config.Current.SelectedPrinter);
        buttons.Controls.AddRange([generate, revoke, refresh]);
        AddFull(root, buttons);
        AddFull(root, new Label { Text = "On the phone, open ZEZMS Settings > Printing & Wireless Printer Readiness, enter the LAN address and temporary code, then approve the browser's Local Network Access prompt once. Permanent device tokens are never shown here.", AutoSize = true, ForeColor = Color.DimGray, MaximumSize = new Size(680, 0) });
        if (_mockMode) AddFull(root, new Label { Text = "QA MOCK MODE IS ACTIVE - no physical pages will be printed.", AutoSize = true, ForeColor = Color.DarkRed, Font = new Font(Font, FontStyle.Bold) });
    }

    private void LoadConfiguration()
    {
        var config = _config.Current;
        LoadPrinters(config.SelectedPrinter);
        _port.Value = config.Port;
        _lan.Checked = config.LanEnabled;
        _startup.Checked = config.StartWithWindows;
        _origins.Text = string.Join(Environment.NewLine, config.AllowedOrigins);
    }

    private void LoadPrinters(string selected)
    {
        _printers.Items.Clear();
        if (_mockMode) _printers.Items.Add("ZEZMS Mock Printer (QA only)");
        foreach (var printer in PrinterCatalog.GetInstalledPrinters()) _printers.Items.Add(printer);
        if (!string.IsNullOrWhiteSpace(selected) && _printers.Items.Contains(selected)) _printers.SelectedItem = selected;
        else if (_printers.Items.Count > 0) _printers.SelectedIndex = 0;
    }

    private void SaveConfiguration()
    {
        try
        {
            var origins = _origins.Lines.SelectMany(line => line.Split([',', ';'], StringSplitOptions.RemoveEmptyEntries)).Select(value => value.Trim()).Where(value => value.Length > 0).ToList();
            var config = new Models.BridgeConfig
            {
                Port = (int)_port.Value, LanEnabled = _lan.Checked, StartWithWindows = _startup.Checked,
                SelectedPrinter = _printers.SelectedItem?.ToString() ?? string.Empty, AllowedOrigins = origins
            };
            _config.Save(config);
            StartupManager.SetEnabled(config.StartWithWindows);
            _restartNotice.Text = "Settings saved. Restart ZEZ Print Bridge now if the port or LAN setting changed.";
            RefreshStatus();
        }
        catch (Exception error) { MessageBox.Show(this, error.Message, "Settings could not be saved", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    private void GeneratePairingCode()
    {
        if (_config.Current.AllowedOrigins.Count == 0)
        {
            MessageBox.Show(this, "Save the exact ZEZMS GitHub Pages origin before pairing. The bridge will not use a wildcard origin.", "Production origin required", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        var value = _pairing.GeneratePairingCode();
        _pairingCode.Text = value.Code;
        _pairingExpiry.Text = "Expires at " + value.ExpiresAt.LocalDateTime.ToString("T") + ". The code is single-use.";
        RefreshStatus();
    }

    private void RevokeAll()
    {
        if (MessageBox.Show(this, "Revoke every paired ZEZMS browser/device? Each device will need a new temporary pairing code.", "Confirm revocation", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        _pairing.RevokeAll();
        RefreshStatus();
    }

    public void RefreshStatus()
    {
        var config = _config.Current;
        var printer = _mockMode && config.SelectedPrinter.StartsWith("ZEZMS Mock", StringComparison.Ordinal)
            ? (Configured:true, Ready:true, Message:"QA mock printer ready")
            : PrinterCatalog.Check(config.SelectedPrinter);
        _bridgeStatus.Text = printer.Ready ? "Ready" : "Attention required";
        _bridgeStatus.ForeColor = printer.Ready ? Color.DarkGreen : Color.DarkRed;
        _printerStatus.Text = string.IsNullOrWhiteSpace(config.SelectedPrinter) ? printer.Message : config.SelectedPrinter + " - " + printer.Message;
        _computerName.Text = Environment.MachineName;
        var addresses = NetworkBinding.PrivateLanAddresses();
        _lanAddress.Text = config.LanEnabled && addresses.Count > 0 ? string.Join(", ", addresses.Select(address => $"http://{address}:{config.Port}")) : "LAN disabled (localhost only)";
        _listening.Text = $"http://127.0.0.1:{config.Port}" + (config.LanEnabled ? " and listed private LAN address(es)" : " only");
        _pairingStatus.Text = _pairing.PairedDeviceCount + " paired device(s)";
        _lastPrint.Text = _jobs.LastResult;
        _autoStart.Text = StartupManager.IsEnabled() ? "Enabled" : "Disabled";
    }

    public void PermitClose() { _reallyClose = true; Close(); }

    private static Label ValueLabel() => new() { AutoSize = true, Font = new Font("Segoe UI", 9F, FontStyle.Bold), MaximumSize = new Size(430, 0) };
    private static void AddHeading(TableLayoutPanel root, string title, string detail)
    {
        var box = new Panel { AutoSize = true, Dock = DockStyle.Fill };
        var heading = new Label { Text = title, AutoSize = true, Font = new Font("Segoe UI", 19F, FontStyle.Bold), ForeColor = Color.FromArgb(15,118,110) };
        var text = new Label { Text = detail, AutoSize = true, Top = 45, MaximumSize = new Size(680, 0), ForeColor = Color.DimGray };
        box.Controls.Add(heading); box.Controls.Add(text); box.MinimumSize = new Size(0, 85);
        root.Controls.Add(box, 0, root.RowCount); root.SetColumnSpan(box, 2); root.RowCount++;
    }
    private static void AddSection(TableLayoutPanel root, string text)
    {
        var label = new Label { Text = text, AutoSize = true, Font = new Font("Segoe UI", 12F, FontStyle.Bold), Padding = new Padding(0, 14, 0, 5) };
        AddFull(root, label);
    }
    private static void AddRow(TableLayoutPanel root, string label, Control control)
    {
        var row = root.RowCount++;
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.Controls.Add(new Label { Text = label, AutoSize = true, Padding = new Padding(0, 5, 0, 5) }, 0, row);
        control.Margin = new Padding(4, 5, 4, 5);
        control.Dock = control is TextBox ? DockStyle.Fill : DockStyle.Top;
        root.Controls.Add(control, 1, row);
    }
    private static void AddFull(TableLayoutPanel root, Control control)
    {
        var row = root.RowCount++;
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        control.Margin = new Padding(4, 6, 4, 6);
        root.Controls.Add(control, 0, row); root.SetColumnSpan(control, 2);
    }
}
