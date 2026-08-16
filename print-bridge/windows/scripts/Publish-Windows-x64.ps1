param(
    [string]$OutputDirectory = ""
)
$ErrorActionPreference = 'Stop'
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$windowsDirectory = (Resolve-Path -LiteralPath (Join-Path $scriptDirectory '..')).Path
$project = Join-Path $windowsDirectory 'ZEZPrintBridge\ZEZPrintBridge.csproj'
if (-not (Test-Path -LiteralPath $project -PathType Leaf)) { throw "Bridge project not found: $project" }
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $windowsDirectory 'artifacts\win-x64-self-contained'
}
$resolvedParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $OutputDirectory))
if (-not (Test-Path -LiteralPath $resolvedParent -PathType Container)) { New-Item -ItemType Directory -Path $resolvedParent -Force | Out-Null }
$publish = [System.IO.Path]::GetFullPath($OutputDirectory)
dotnet publish $project -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -p:PublishReadyToRun=true -o $publish
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed.' }
Write-Host "Self-contained Windows x64 package published to: $publish"
