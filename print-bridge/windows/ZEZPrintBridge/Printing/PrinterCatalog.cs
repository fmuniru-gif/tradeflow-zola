using System.Drawing.Printing;
using System.Management;

namespace ZEZPrintBridge.Printing;

public static class PrinterCatalog
{
    public static IReadOnlyList<string> GetInstalledPrinters()
    {
        var printers = new List<string>();
        foreach (string printer in PrinterSettings.InstalledPrinters) printers.Add(printer);
        return printers.Order(StringComparer.CurrentCultureIgnoreCase).ToArray();
    }

    public static (bool Configured, bool Ready, string Message) Check(string? printerName)
    {
        if (string.IsNullOrWhiteSpace(printerName)) return (false, false, "No printer selected");
        if (!GetInstalledPrinters().Contains(printerName, StringComparer.CurrentCultureIgnoreCase))
            return (true, false, "Selected printer is not installed");
        try
        {
            var escaped = printerName.Replace("\\", "\\\\").Replace("'", "''");
            using var searcher = new ManagementObjectSearcher($"SELECT WorkOffline, PrinterStatus, ExtendedPrinterStatus FROM Win32_Printer WHERE Name='{escaped}'");
            foreach (ManagementObject printer in searcher.Get())
            {
                var offline = Convert.ToBoolean(printer["WorkOffline"] ?? false);
                var printerStatus = Convert.ToUInt16(printer["PrinterStatus"] ?? 0);
                var extended = Convert.ToUInt16(printer["ExtendedPrinterStatus"] ?? 0);
                if (offline || printerStatus == 7 || extended is 7 or 9 or 11)
                    return (true, false, "Printer is offline or in an error state");
                return (true, true, "Printer is available");
            }
        }
        catch
        {
            // Installed-printer validation remains useful if WMI status is unavailable.
        }
        return (true, true, "Printer is installed; detailed Windows status is unavailable");
    }
}
