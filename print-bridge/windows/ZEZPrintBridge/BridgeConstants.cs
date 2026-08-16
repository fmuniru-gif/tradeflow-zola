namespace ZEZPrintBridge;

public static class BridgeConstants
{
    public const string Version = "1.0.0";
    public const string ProtocolVersion = "ZEZPRINT/1";
    public const int DefaultPort = 43127;
    public const int MaximumPayloadBytes = 4 * 1024 * 1024;
    public const int MaximumRetainedJobs = 500;
    public static readonly TimeSpan JobRetention = TimeSpan.FromHours(24);
    public static readonly TimeSpan PairingCodeLifetime = TimeSpan.FromMinutes(10);
    public static readonly string[] AllowedDocumentTypes = ["receipt", "invoice", "waybill", "test"];
}
