using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ZEZPrintBridge.Configuration;
using ZEZPrintBridge.Models;

namespace ZEZPrintBridge.Security;

public sealed class PairingStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("ZEZPrintBridge/paired-devices/v1");
    private readonly object _gate = new();
    private readonly AppPaths _paths;
    private readonly TimeProvider _clock;
    private List<PairedDevice> _devices;
    private string _pairingCode = string.Empty;
    private DateTimeOffset _pairingExpiresAt;

    public PairingStore(AppPaths paths, TimeProvider? clock = null)
    {
        _paths = paths;
        _clock = clock ?? TimeProvider.System;
        _devices = Load();
    }

    public int PairedDeviceCount { get { lock (_gate) return _devices.Count; } }

    public (string Code, DateTimeOffset ExpiresAt) GeneratePairingCode()
    {
        lock (_gate)
        {
            _pairingCode = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
            _pairingExpiresAt = _clock.GetUtcNow().Add(BridgeConstants.PairingCodeLifetime);
            return (_pairingCode, _pairingExpiresAt);
        }
    }

    public string Pair(string code, string deviceName)
    {
        lock (_gate)
        {
            var now = _clock.GetUtcNow();
            if (_pairingCode.Length != 6 || now > _pairingExpiresAt || !FixedEquals(_pairingCode, (code ?? string.Empty).Trim()))
                throw new InvalidOperationException("Pairing code is invalid or expired.");
            _pairingCode = string.Empty;
            _pairingExpiresAt = default;
            var tokenBytes = RandomNumberGenerator.GetBytes(32);
            var token = Convert.ToBase64String(tokenBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            _devices.Add(new PairedDevice
            {
                TokenHash = HashToken(token),
                DeviceName = string.IsNullOrWhiteSpace(deviceName) ? "ZEZMS Device" : deviceName.Trim()[..Math.Min(80, deviceName.Trim().Length)],
                PairedAt = now,
                LastSeenAt = now
            });
            Save();
            return token;
        }
    }

    public bool Authenticate(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return false;
        var hash = HashToken(token);
        lock (_gate)
        {
            var match = _devices.FirstOrDefault(device => FixedEquals(device.TokenHash, hash));
            if (match is null) return false;
            match.LastSeenAt = _clock.GetUtcNow();
            Save();
            return true;
        }
    }

    public bool Revoke(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return false;
        var hash = HashToken(token);
        lock (_gate)
        {
            var removed = _devices.RemoveAll(device => FixedEquals(device.TokenHash, hash)) > 0;
            if (removed) Save();
            return removed;
        }
    }

    public void RevokeAll()
    {
        lock (_gate) { _devices.Clear(); Save(); }
    }

    private List<PairedDevice> Load()
    {
        try
        {
            if (!File.Exists(_paths.PairedDevicesFile)) return [];
            var encrypted = File.ReadAllBytes(_paths.PairedDevicesFile);
            var clear = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
            return JsonSerializer.Deserialize<List<PairedDevice>>(clear) ?? [];
        }
        catch { return []; }
    }

    private void Save()
    {
        var clear = JsonSerializer.SerializeToUtf8Bytes(_devices);
        var encrypted = ProtectedData.Protect(clear, Entropy, DataProtectionScope.CurrentUser);
        ConfigurationStore.WriteAtomic(_paths.PairedDevicesFile, encrypted);
        CryptographicOperations.ZeroMemory(clear);
    }

    private static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private static bool FixedEquals(string left, string right)
    {
        var a = Encoding.UTF8.GetBytes(left);
        var b = Encoding.UTF8.GetBytes(right);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }
}
