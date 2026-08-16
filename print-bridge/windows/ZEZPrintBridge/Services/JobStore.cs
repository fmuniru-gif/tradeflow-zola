using System.Text.Json;
using ZEZPrintBridge.Configuration;
using ZEZPrintBridge.Models;

namespace ZEZPrintBridge.Services;

public sealed class JobStore
{
    private readonly object _gate = new();
    private readonly AppPaths _paths;
    private readonly TimeProvider _clock;
    private Dictionary<string, PrintJobMetadata> _jobs;

    public JobStore(AppPaths paths, TimeProvider? clock = null)
    {
        _paths = paths;
        _clock = clock ?? TimeProvider.System;
        _jobs = Load();
        PruneAndSave();
    }

    public (PrintJobMetadata Job, bool IsNew, bool Conflict) Accept(PrintRequest request, string identityHash)
    {
        lock (_gate)
        {
            if (_jobs.TryGetValue(request.JobId, out var existing))
                return (Clone(existing), false, !string.Equals(existing.IdentityHash, identityHash, StringComparison.Ordinal));
            var now = _clock.GetUtcNow();
            var job = new PrintJobMetadata
            {
                JobId = request.JobId,
                DocumentType = request.DocumentType.ToLowerInvariant(),
                IdentityHash = identityHash,
                Status = "accepted",
                Message = "Print job accepted.",
                CreatedAt = now,
                UpdatedAt = now
            };
            _jobs[job.JobId] = job;
            PruneAndSave();
            return (Clone(job), true, false);
        }
    }

    public PrintJobMetadata? Get(string id)
    {
        lock (_gate) return _jobs.TryGetValue(id, out var job) ? Clone(job) : null;
    }

    public void Update(string id, string status, string message, string printerName = "")
    {
        lock (_gate)
        {
            if (!_jobs.TryGetValue(id, out var job)) return;
            job.Status = status;
            job.Message = message;
            job.PrinterName = printerName;
            job.UpdatedAt = _clock.GetUtcNow();
            Save();
        }
    }

    public string LastResult
    {
        get
        {
            lock (_gate)
            {
                var job = _jobs.Values.OrderByDescending(item => item.UpdatedAt).FirstOrDefault();
                return job is null ? "No print jobs yet" : $"{job.Status} at {job.UpdatedAt.LocalDateTime:g}";
            }
        }
    }

    private Dictionary<string, PrintJobMetadata> Load()
    {
        try
        {
            if (File.Exists(_paths.JobsFile))
                return JsonSerializer.Deserialize<List<PrintJobMetadata>>(File.ReadAllBytes(_paths.JobsFile))?.ToDictionary(item => item.JobId) ?? [];
        }
        catch { }
        return [];
    }

    private void PruneAndSave()
    {
        var cutoff = _clock.GetUtcNow().Subtract(BridgeConstants.JobRetention);
        _jobs = _jobs.Values.Where(job => job.UpdatedAt >= cutoff)
            .OrderByDescending(job => job.UpdatedAt).Take(BridgeConstants.MaximumRetainedJobs)
            .ToDictionary(job => job.JobId);
        Save();
    }

    private void Save() => ConfigurationStore.WriteAtomic(_paths.JobsFile, JsonSerializer.SerializeToUtf8Bytes(_jobs.Values.OrderByDescending(item => item.UpdatedAt)));

    private static PrintJobMetadata Clone(PrintJobMetadata source) => new()
    {
        JobId = source.JobId, DocumentType = source.DocumentType, IdentityHash = source.IdentityHash,
        Status = source.Status, Message = source.Message, PrinterName = source.PrinterName,
        CreatedAt = source.CreatedAt, UpdatedAt = source.UpdatedAt
    };
}
