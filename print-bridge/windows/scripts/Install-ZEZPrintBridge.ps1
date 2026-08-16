param(
    [string]$SourceDirectory = ""
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($SourceDirectory)) { $SourceDirectory = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'app' }
$source = (Resolve-Path -LiteralPath $SourceDirectory -ErrorAction Stop).Path
$sourceExe = Join-Path $source 'ZEZPrintBridge.exe'
if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) { throw "Published ZEZPrintBridge.exe was not found in $source" }
$programsRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs'
$destination = [System.IO.Path]::GetFullPath((Join-Path $programsRoot 'ZEZPrintBridge'))
$expectedRoot = [System.IO.Path]::GetFullPath($programsRoot).TrimEnd('\') + '\'
if (-not $destination.StartsWith($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Installation target validation failed.' }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $destination -Recurse -Force
$installedExe = Join-Path $destination 'ZEZPrintBridge.exe'
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'ZEZ Print Bridge.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($startMenu)
$shortcut.TargetPath = $installedExe
$shortcut.WorkingDirectory = $destination
$shortcut.Description = 'ZEZ Print Bridge'
$shortcut.Save()
Start-Process -FilePath $installedExe
Write-Host "ZEZ Print Bridge installed for the current Windows user at: $destination"
Write-Host 'LAN firewall access is not enabled automatically. Use Enable-LanFirewallRule.ps1 only if phone printing is required.'
