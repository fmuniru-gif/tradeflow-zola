namespace ZEZPrintBridge.Models;

public sealed class BridgeConfig
{
    public int Port { get; set; } = BridgeConstants.DefaultPort;
    public bool LanEnabled { get; set; }
    public bool StartWithWindows { get; set; }
    public string SelectedPrinter { get; set; } = string.Empty;
    public List<string> AllowedOrigins { get; set; } = [];
}

public sealed record PairRequest(string PairingCode, string DeviceName);

public sealed class PrintRequest
{
    public string JobId { get; set; } = string.Empty;
    public string DocumentType { get; set; } = string.Empty;
    public string DocumentId { get; set; } = string.Empty;
    public int Copies { get; set; } = 1;
    public string Html { get; set; } = string.Empty;
    public PrintPage Page { get; set; } = new();
}

public sealed class PrintPage
{
    public string Size { get; set; } = "A5";
    public string Orientation { get; set; } = "portrait";
}

public sealed class PrintEnvelope
{
    public required PrintRequest Request { get; init; }
    public required string IdentityHash { get; init; }
}

public sealed class PrintJobMetadata
{
    public string JobId { get; set; } = string.Empty;
    public string DocumentType { get; set; } = string.Empty;
    public string IdentityHash { get; set; } = string.Empty;
    public string Status { get; set; } = "accepted";
    public string Message { get; set; } = string.Empty;
    public string PrinterName { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed record PrintResult(string Status, string Message = "");

public sealed class PairedDevice
{
    public string TokenHash { get; set; } = string.Empty;
    public string DeviceName { get; set; } = string.Empty;
    public DateTimeOffset PairedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
}
