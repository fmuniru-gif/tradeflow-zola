using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Xunit;
using ZEZPrintBridge.Api;
using ZEZPrintBridge.Configuration;
using ZEZPrintBridge.Models;
using ZEZPrintBridge.Printing;
using ZEZPrintBridge.Security;
using ZEZPrintBridge.Services;

namespace ZEZPrintBridge.Tests;

public sealed class BridgeCoreTests
{
    [Fact]
    public void HtmlValidator_AcceptsSelfContainedA5Document()
    {
        var result = HtmlSecurityValidator.Validate(ValidRequest());
        Assert.True(result.IsValid, result.Message);
        Assert.Equal(64, result.IdentityHash.Length);
    }

    [Theory]
    [InlineData("unknown", "<html></html>", "invalid-document-type")]
    [InlineData("receipt", "<script>alert(1)</script>", "unsafe-html")]
    [InlineData("receipt", "<img src='https://remote.invalid/a.png'>", "unsafe-html")]
    [InlineData("receipt", "<div onclick='x()'>X</div>", "unsafe-html")]
    public void HtmlValidator_RejectsInvalidOrActiveContent(string type, string html, string code)
    {
        var request = ValidRequest(); request.DocumentType = type; request.Html = html;
        var result = HtmlSecurityValidator.Validate(request);
        Assert.False(result.IsValid);
        Assert.Equal(code, result.Code);
    }

    [Fact]
    public void HtmlValidator_RejectsOversizedPayload()
    {
        var request = ValidRequest(); request.Html = new string('x', BridgeConstants.MaximumPayloadBytes + 1);
        Assert.Equal("payload-too-large", HtmlSecurityValidator.Validate(request).Code);
    }

    [Fact]
    public void JobStore_IsIdempotentAndPersistsRecentJobIds()
    {
        using var temp = new TempDirectory();
        var paths = new AppPaths(temp.Path);
        var store = new JobStore(paths);
        var request = ValidRequest();
        var first = store.Accept(request, "hash-one");
        var duplicate = store.Accept(request, "hash-one");
        var conflict = store.Accept(request, "different-hash");
        Assert.True(first.IsNew);
        Assert.False(duplicate.IsNew);
        Assert.False(duplicate.Conflict);
        Assert.True(conflict.Conflict);
        store.Update(request.JobId, "printed", "done");
        var afterRestart = new JobStore(paths).Accept(request, "hash-one");
        Assert.False(afterRestart.IsNew);
        Assert.Equal("printed", afterRestart.Job.Status);
    }

    [Fact]
    public void PairingStore_CreatesStrongTokenStoresOnlyProtectedHashAndRevokes()
    {
        using var temp = new TempDirectory();
        var paths = new AppPaths(temp.Path);
        var store = new PairingStore(paths);
        var code = store.GeneratePairingCode().Code;
        var token = store.Pair(code, "Owner Phone");
        Assert.True(token.Length >= 43);
        Assert.True(store.Authenticate(token));
        var bytes = File.ReadAllBytes(paths.PairedDevicesFile);
        Assert.DoesNotContain(token, Encoding.UTF8.GetString(bytes));
        Assert.True(store.Revoke(token));
        Assert.False(store.Authenticate(token));
    }

    [Fact]
    public void PairingCode_Expires()
    {
        using var temp = new TempDirectory();
        var clock = new TestTimeProvider(DateTimeOffset.UtcNow);
        var store = new PairingStore(new AppPaths(temp.Path), clock);
        var code = store.GeneratePairingCode().Code;
        clock.Advance(TimeSpan.FromMinutes(11));
        Assert.Throws<InvalidOperationException>(() => store.Pair(code, "Late device"));
    }

    [Fact]
    public void ConfigurationStore_NormalizesExactOriginsAndPersistsLocalSettings()
    {
        using var temp = new TempDirectory();
        var store = new ConfigurationStore(new AppPaths(temp.Path));
        store.Save(new BridgeConfig { Port = 43127, LanEnabled = true, SelectedPrinter = "Printer", AllowedOrigins = ["https://example.github.io", "https://example.github.io/", "javascript:bad"] });
        var loaded = new ConfigurationStore(new AppPaths(temp.Path)).Current;
        Assert.True(loaded.LanEnabled);
        Assert.Equal("Printer", loaded.SelectedPrinter);
        Assert.Equal(["https://example.github.io"], loaded.AllowedOrigins);
    }

    [Fact]
    public void MetadataLogger_DoesNotReceiveOrPersistDocumentHtml()
    {
        using var temp = new TempDirectory();
        var paths = new AppPaths(temp.Path);
        var logger = new MetadataLogger(paths);
        logger.Write("print-finished", Guid.NewGuid().ToString(), "receipt", "printed", "Printer");
        var text = File.ReadAllText(paths.LogFile);
        Assert.Contains("print-finished", text);
        Assert.DoesNotContain("Customer", text);
        Assert.DoesNotContain("<html", text);
    }

    [Fact]
    public void InstalledPrinterEnumeration_CompletesOnWindows()
    {
        var printers = PrinterCatalog.GetInstalledPrinters();
        Assert.NotNull(printers);
    }

    [Fact]
    public void WebView2Runtime_IsInstalled()
    {
        var version = CoreWebView2Environment.GetAvailableBrowserVersionString();
        Assert.False(string.IsNullOrWhiteSpace(version));
    }

    [Fact]
    public async Task Api_EnforcesCorsPairingAuthValidationAndIdempotency()
    {
        using var temp = new TempDirectory();
        var port = FreePort();
        var paths = new AppPaths(temp.Path);
        var config = new ConfigurationStore(paths);
        config.Save(new BridgeConfig { Port = port, SelectedPrinter = "ZEZMS Mock Printer (QA only)", AllowedOrigins = ["https://shop.example.github.io"] });
        var pairing = new PairingStore(paths);
        var jobs = new JobStore(paths);
        var logger = new MetadataLogger(paths);
        var queue = new PrintQueueService(config, jobs, new MockPrintRenderer(), logger, true);
        await using var api = new BridgeApiHost(config, pairing, jobs, queue, logger);
        await api.StartAsync();
        using var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}") };

        var health = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        var healthText = await health.Content.ReadAsStringAsync();
        Assert.Contains("ZEZPRINT/1", healthText);
        Assert.DoesNotContain("token", healthText, StringComparison.OrdinalIgnoreCase);

        using var invalidOrigin = Request(HttpMethod.Post, "/pair", "https://evil.example", new { pairingCode = "000000", deviceName = "evil" });
        Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(invalidOrigin)).StatusCode);

        var pairingCode = pairing.GeneratePairingCode().Code;
        using var pair = Request(HttpMethod.Post, "/pair", "https://shop.example.github.io", new { pairingCode, deviceName = "Owner Phone" });
        var pairResponse = await client.SendAsync(pair);
        Assert.Equal(HttpStatusCode.OK, pairResponse.StatusCode);
        var token = JsonDocument.Parse(await pairResponse.Content.ReadAsStringAsync()).RootElement.GetProperty("deviceToken").GetString();
        Assert.False(string.IsNullOrWhiteSpace(token));

        using var noAuth = Request(HttpMethod.Post, "/print", "https://shop.example.github.io", ValidRequest());
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(noAuth)).StatusCode);

        var request = ValidRequest();
        using var print = Request(HttpMethod.Post, "/print", "https://shop.example.github.io", request, token);
        var accepted = await client.SendAsync(print);
        Assert.Equal(HttpStatusCode.Accepted, accepted.StatusCode);

        using var duplicate = Request(HttpMethod.Post, "/print", "https://shop.example.github.io", request, token);
        var duplicateResponse = await client.SendAsync(duplicate);
        Assert.Equal(HttpStatusCode.Accepted, duplicateResponse.StatusCode);
        Assert.Contains("\"duplicate\":true", await duplicateResponse.Content.ReadAsStringAsync());

        for (var i = 0; i < 30; i++)
        {
            using var jobRequest = Request(HttpMethod.Get, "/job/" + request.JobId, "https://shop.example.github.io", null, token);
            var jobResponse = await client.SendAsync(jobRequest);
            var body = await jobResponse.Content.ReadAsStringAsync();
            if (body.Contains("\"printed\"")) break;
            await Task.Delay(40);
        }
        Assert.Equal("printed", jobs.Get(request.JobId)?.Status);

        using var forget = Request(HttpMethod.Delete, "/pair", "https://shop.example.github.io", null, token);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(forget)).StatusCode);
        using var revoked = Request(HttpMethod.Get, "/status", "https://shop.example.github.io", null, token);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(revoked)).StatusCode);
    }

    private static PrintRequest ValidRequest() => new()
    {
        JobId = Guid.NewGuid().ToString(), DocumentType = "receipt", DocumentId = "SR-TEST", Copies = 1,
        Html = "<!doctype html><html><head><style>@page{size:A5 portrait}body{background:#fff}.wm{background:url(data:image/jpeg;base64,AA==)}</style></head><body><div class='wm'>APPROVED</div></body></html>",
        Page = new PrintPage { Size = "A5", Orientation = "portrait" }
    };

    private static HttpRequestMessage Request(HttpMethod method, string path, string origin, object? body, string? token = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add("Origin", origin);
        request.Headers.Add("X-ZEZPrint-Protocol", BridgeConstants.ProtocolVersion);
        if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null) request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        return request;
    }

    private static int FreePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop(); return port;
    }

    private sealed class TestTimeProvider(DateTimeOffset current) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => current;
        public void Advance(TimeSpan amount) => current = current.Add(amount);
    }

    private sealed class TempDirectory : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "ZEZPrintBridgeTests", Guid.NewGuid().ToString("N"));
        public TempDirectory() => Directory.CreateDirectory(Path);
        public void Dispose() { try { Directory.Delete(Path, true); } catch { } }
    }
}
