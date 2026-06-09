$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ConfigFile = Join-Path (Split-Path -Parent $PSScriptRoot) "config.env"

function Load-EnvFile([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    [Environment]::SetEnvironmentVariable($key, $val, "Process")
  }
}

Load-EnvFile $ConfigFile

if (-not $env:MT5_PATH) {
  $env:MT5_PATH = Join-Path (Split-Path -Parent $ProjectRoot) "MT5\terminal64.exe"
}
if (-not $env:MT5_TCP_HOST) {
  throw "Set MT5_TCP_HOST in deploy/config.env to your Linux server IP"
}

$Mt5Exe = $env:MT5_PATH
$mt5Exists = Test-Path -LiteralPath $Mt5Exe
if (-not $mt5Exists) {
  $mt5Exists = (cmd /c "if exist `"$Mt5Exe`" (echo 1) else (echo 0)") -eq "1"
}
if (-not $mt5Exists) {
  throw "MT5 not found: $Mt5Exe"
}

if (-not (Get-CimInstance Win32_Process -Filter "Name='terminal64.exe'" -ErrorAction SilentlyContinue)) {
  Write-Host "[bridge] starting MT5..."
  Start-Process -FilePath $Mt5Exe
  Start-Sleep -Seconds 10
}

Write-Host "[bridge] MT5_PATH=$($env:MT5_PATH)"
Write-Host "[bridge] MT5_TCP_HOST=$($env:MT5_TCP_HOST):$($env:MT5_TCP_PORT)"
Write-Host "[bridge] MT5_SYMBOLS=$($env:MT5_SYMBOLS)"

Set-Location $ProjectRoot
python bridge/mt5_bridge.py
