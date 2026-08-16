using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace ZEZPrintBridge.Api;

public static class NetworkBinding
{
    public static IReadOnlyList<IPAddress> PrivateLanAddresses() => NetworkInterface.GetAllNetworkInterfaces()
        .Where(item => item.OperationalStatus == OperationalStatus.Up && item.NetworkInterfaceType is not (NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel))
        .SelectMany(item => item.GetIPProperties().UnicastAddresses)
        .Select(item => item.Address)
        .Where(address => address.AddressFamily == AddressFamily.InterNetwork && IsPrivate(address))
        .Distinct()
        .OrderBy(address => address.ToString())
        .ToArray();

    public static bool IsPrivate(IPAddress address)
    {
        var bytes = address.GetAddressBytes();
        return bytes[0] == 10 || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31) || (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 169 && bytes[1] == 254);
    }
}
