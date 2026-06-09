$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host "[install] pip install MetaTrader5..."
pip install -r (Join-Path $ProjectRoot "bridge\requirements.txt")

$ConfigExample = Join-Path (Split-Path -Parent $PSScriptRoot) "config.env.example"
$ConfigFile = Join-Path (Split-Path -Parent $PSScriptRoot) "config.env"
if (-not (Test-Path $ConfigFile)) {
  Copy-Item $ConfigExample $ConfigFile
  Write-Host "[install] created deploy/config.env - edit MT5_TCP_HOST before start"
}

Write-Host "[install] done. Edit deploy/config.env then run:"
Write-Host "  powershell -File deploy/windows/start-bridge.ps1"
