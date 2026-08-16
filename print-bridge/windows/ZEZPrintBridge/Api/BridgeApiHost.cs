using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.DependencyInjection;
using ZEZPrintBridge.Configuration;
using ZEZPrintBridge.Models;
using ZEZPrintBridge.Printing;
using ZEZPrintBridge.Security;
using ZEZPrintBridge.Services;

namespace ZEZPrintBridge.Api;

public sealed class BridgeApiHost : IAsyncDisposable
{
    private readonly ConfigurationStore _config;
    private readonly PairingStore _pairing;
    private readonly JobStore _jobs;
    private readonly PrintQueueService _queue;
    private readonly MetadataLogger _logger;
    private WebApplication? _app;

    public BridgeApiHost(ConfigurationStore config, PairingStore pairing, JobStore jobs, PrintQueueService queue, MetadataLogger logger)
    {
        _config = config; _pairing = pairing; _jobs = jobs; _queue = queue; _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        var current = _config.Current;
        var options = new WebApplicationOptions { Args = [], ApplicationName = typeof(BridgeApiHost).Assembly.FullName, EnvironmentName = "Production" };
        var builder = WebApplication.CreateSlimBuilder(options);
        builder.Services.Configure<JsonOptions>(settings => settings.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
        builder.WebHost.ConfigureKestrel(server =>
        {
            server.Limits.MaxRequestBodySize = BridgeConstants.MaximumPayloadBytes + 64 * 1024;
            server.Listen(IPAddress.Loopback, current.Port, listen => listen.Protocols = HttpProtocols.Http1);
            if (current.LanEnabled)
            {
                foreach (var address in NetworkBinding.PrivateLanAddresses()) server.Listen(address, current.Port, listen => listen.Protocols = HttpProtocols.Http1);
            }
        });
        var app = builder.Build();
        app.Use(async (context, next) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            var origin = context.Request.Headers.Origin.ToString();
            var originAllowed = IsAllowedOrigin(origin);
            if (originAllowed)
            {
                context.Response.Headers.AccessControlAllowOrigin = origin;
                context.Response.Headers.Vary = "Origin";
            }
            if (HttpMethods.IsOptions(context.Request.Method))
            {
                if (!originAllowed) { context.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
                context.Response.Headers.AccessControlAllowMethods = "GET, POST, DELETE, OPTIONS";
                context.Response.Headers.AccessControlAllowHeaders = "Authorization, Content-Type, X-ZEZPrint-Protocol";
                context.Response.Headers.AccessControlMaxAge = "600";
                if (string.Equals(context.Request.Headers["Access-Control-Request-Private-Network"], "true", StringComparison.OrdinalIgnoreCase))
                    context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
                context.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }
            var browserProtected = context.Request.Path != "/health";
            if (browserProtected && !originAllowed) { await Error(context, 403, "origin-not-allowed", "This web origin is not allowed by ZEZ Print Bridge."); return; }
            if (origin.Length > 0 && !originAllowed) { await Error(context, 403, "origin-not-allowed", "This web origin is not allowed by ZEZ Print Bridge."); return; }
            if (context.Request.Path != "/health" && context.Request.Headers["X-ZEZPrint-Protocol"] != BridgeConstants.ProtocolVersion)
            { await Error(context, 426, "protocol-mismatch", "ZEZ Print protocol is missing or incompatible."); return; }
            await next();
        });

        app.MapGet("/health", () =>
        {
            var config = _config.Current;
            var printer = PrinterCatalog.Check(config.SelectedPrinter);
            return Results.Ok(new
            {
                bridgeVersion = BridgeConstants.Version, protocolVersion = BridgeConstants.ProtocolVersion,
                ready = printer.Configured && printer.Ready, printerConfigured = printer.Configured,
                printerReady = printer.Ready, printerName = config.SelectedPrinter,
                pairingRequired = true
            });
        });

        app.MapGet("/status", (HttpContext context) =>
        {
            if (!Authenticate(context, out var authError)) return authError;
            var config = _config.Current;
            var printer = PrinterCatalog.Check(config.SelectedPrinter);
            return Results.Ok(new
            {
                bridgeVersion = BridgeConstants.Version, protocolVersion = BridgeConstants.ProtocolVersion,
                computerName = Environment.MachineName, listeningPort = config.Port, lanEnabled = config.LanEnabled,
                printerConfigured = printer.Configured, printerReady = printer.Ready, printerName = config.SelectedPrinter,
                lastPrintResult = _jobs.LastResult, pairedDeviceCount = _pairing.PairedDeviceCount
            });
        });

        app.MapPost("/pair", (PairRequest request) =>
        {
            try
            {
                var token = _pairing.Pair(request.PairingCode, request.DeviceName);
                var config = _config.Current;
                var printer = PrinterCatalog.Check(config.SelectedPrinter);
                _logger.Write("device-paired", result: "success");
                return Results.Ok(new
                {
                    deviceToken = token, bridgeVersion = BridgeConstants.Version, protocolVersion = BridgeConstants.ProtocolVersion,
                    printerConfigured = printer.Configured, printerReady = printer.Ready, printerName = config.SelectedPrinter
                });
            }
            catch (InvalidOperationException error) { return Results.Json(new { code = "pairing-failed", message = error.Message }, statusCode: 403); }
        });

        app.MapDelete("/pair", (HttpContext context) =>
        {
            var token = Bearer(context);
            if (!_pairing.Authenticate(token)) return Results.Unauthorized();
            _pairing.Revoke(token);
            _logger.Write("device-revoked", result: "success");
            return Results.Ok(new { revoked = true });
        });

        app.MapPost("/print", async (HttpContext context, PrintRequest request) =>
        {
            if (!Authenticate(context, out var authError)) return authError;
            var validation = HtmlSecurityValidator.Validate(request);
            if (!validation.IsValid) return Results.Json(new { code = validation.Code, message = validation.Message }, statusCode: validation.Code == "payload-too-large" ? 413 : 400);
            var accepted = _jobs.Accept(request, validation.IdentityHash);
            if (accepted.Conflict) return Results.Conflict(new { code = "job-id-conflict", message = "This jobId was previously used for different print content." });
            if (accepted.IsNew)
            {
                await _queue.QueueAsync(new PrintEnvelope { Request = request, IdentityHash = validation.IdentityHash });
                _logger.Write("print-accepted", request.JobId, request.DocumentType, "accepted", _config.Current.SelectedPrinter);
            }
            return Results.Json(new { jobId = accepted.Job.JobId, status = accepted.Job.Status, duplicate = !accepted.IsNew }, statusCode: 202);
        });

        app.MapGet("/job/{id}", (HttpContext context, string id) =>
        {
            if (!Authenticate(context, out var authError)) return authError;
            var job = _jobs.Get(id);
            return job is null
                ? Results.NotFound(new { code = "job-not-found", message = "Print job was not found or has expired." })
                : Results.Ok(new { jobId = job.JobId, status = job.Status, message = job.Message, createdAt = job.CreatedAt, updatedAt = job.UpdatedAt });
        });

        _app = app;
        _queue.Start();
        await app.StartAsync(cancellationToken);
        _logger.Write("bridge-started", result: current.LanEnabled ? "lan-enabled" : "localhost-only");
    }

    private bool IsAllowedOrigin(string origin) => origin.Length > 0 && _config.Current.AllowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase);

    private bool Authenticate(HttpContext context, out IResult error)
    {
        if (_pairing.Authenticate(Bearer(context))) { error = Results.Empty; return true; }
        error = Results.Json(new { code = "unauthorized", message = "A valid paired-device token is required." }, statusCode: 401);
        return false;
    }

    private static string Bearer(HttpContext context)
    {
        var header = context.Request.Headers.Authorization.ToString();
        return header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header[7..].Trim() : string.Empty;
    }

    private static async Task Error(HttpContext context, int status, string code, string message)
    {
        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new { code, message });
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is not null)
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            await _app.StopAsync(timeout.Token);
            await _app.DisposeAsync();
        }
        await _queue.DisposeAsync();
    }
}
