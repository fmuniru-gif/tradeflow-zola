using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using ZEZPrintBridge.Models;

namespace ZEZPrintBridge.Security;

public static partial class HtmlSecurityValidator
{
    private static readonly string[] ForbiddenTokens =
    [
        "<script", "<iframe", "<object", "<embed", "<applet", "<base", "<link",
        "javascript:", "vbscript:", "file:", "ftp:", "http://", "https://",
        "window.chrome", "webview.postmessage", "ms-appx:", "shell:"
    ];

    public static (bool IsValid, string Code, string Message, string IdentityHash) Validate(PrintRequest? request)
    {
        if (request is null) return Invalid("invalid-request", "A print request is required.");
        if (!Guid.TryParse(request.JobId, out _)) return Invalid("invalid-job-id", "jobId must be a UUID.");
        var type = (request.DocumentType ?? string.Empty).Trim().ToLowerInvariant();
        if (!BridgeConstants.AllowedDocumentTypes.Contains(type)) return Invalid("invalid-document-type", "Unsupported document type.");
        if (request.DocumentId is null || request.DocumentId.Length is < 1 or > 160) return Invalid("invalid-document-id", "documentId is required and must be at most 160 characters.");
        if (request.Copies is < 1 or > 5) return Invalid("invalid-copies", "copies must be between 1 and 5.");
        if (!string.Equals(request.Page?.Size, "A5", StringComparison.OrdinalIgnoreCase) || !string.Equals(request.Page?.Orientation, "portrait", StringComparison.OrdinalIgnoreCase))
            return Invalid("invalid-page", "Only A5 portrait print jobs are accepted.");
        if (string.IsNullOrWhiteSpace(request.Html)) return Invalid("invalid-html", "Printable HTML is required.");
        if (Encoding.UTF8.GetByteCount(request.Html) > BridgeConstants.MaximumPayloadBytes) return Invalid("payload-too-large", "Printable HTML exceeds the 4 MB limit.");
        var lower = request.Html.ToLowerInvariant();
        var forbidden = ForbiddenTokens.FirstOrDefault(lower.Contains);
        if (forbidden is not null) return Invalid("unsafe-html", "Printable HTML contains a forbidden active or remote-content construct.");
        if (EventHandlerRegex().IsMatch(request.Html) || MetaRefreshRegex().IsMatch(request.Html))
            return Invalid("unsafe-html", "Printable HTML contains executable event or navigation markup.");
        foreach (Match match in CssUrlRegex().Matches(request.Html))
        {
            var value = match.Groups[1].Value.Trim(' ', '\'', '"');
            if (!value.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
                return Invalid("unsafe-html", "CSS image URLs must be embedded data images.");
        }
        var identity = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join("\n", type, request.DocumentId, request.Copies, request.Html)))).ToLowerInvariant();
        return (true, string.Empty, string.Empty, identity);
    }

    private static (bool, string, string, string) Invalid(string code, string message) => (false, code, message, string.Empty);

    [GeneratedRegex(@"\son[a-z]+\s*=", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex EventHandlerRegex();

    [GeneratedRegex(@"<meta[^>]+http-equiv\s*=", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex MetaRefreshRegex();

    [GeneratedRegex(@"url\(\s*([^\)]+)\s*\)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex CssUrlRegex();
}
