param(
    [ValidateRange(1024,65535)][int]$Port = 43127
)
$ErrorActionPreference = 'Stop'
$ruleName = "ZEZ Print Bridge LAN TCP $Port"
$rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction Stop
Write-Host "The following exact firewall rule will be removed: $($rule.DisplayName)"
$confirmation = Read-Host 'Type REMOVE to continue'
if ($confirmation -cne 'REMOVE') { throw 'Firewall change cancelled.' }
$rule | Remove-NetFirewallRule -ErrorAction Stop
Write-Host "Firewall rule removed: $ruleName"
