param(
    [Parameter(Mandatory=$true)][string]$ProgramPath,
    [ValidateRange(1024,65535)][int]$Port = 43127
)
$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path -LiteralPath $ProgramPath -ErrorAction Stop).Path
if (-not (Test-Path -LiteralPath $exe -PathType Leaf) -or [System.IO.Path]::GetExtension($exe) -ne '.exe') { throw 'ProgramPath must identify the installed ZEZPrintBridge.exe.' }
$ruleName = "ZEZ Print Bridge LAN TCP $Port"
if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) { throw "Firewall rule already exists: $ruleName" }
Write-Host "This will allow inbound TCP port $Port to the exact program below on PRIVATE Windows networks only:"
Write-Host $exe
$confirmation = Read-Host 'Type ENABLE to continue'
if ($confirmation -cne 'ENABLE') { throw 'Firewall change cancelled.' }
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Program $exe -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
Write-Host "Private-network firewall rule created: $ruleName"
