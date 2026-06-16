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

$Mt5Exe = $env:MT5_PATH
$mt5Exists = Test-Path -LiteralPath $Mt5Exe
if (-not $mt5Exists) {
  $mt5Exists = (cmd /c "if exist `"$Mt5Exe`" (echo 1) else (echo 0)") -eq "1"
}
if (-not $mt5Exists) {
  throw "MT5 not found: $Mt5Exe"
}

if (-not (Get-Process terminal64 -ErrorAction SilentlyContinue)) {
  Write-Host "[trade] starting MT5..."
  Start-Process -LiteralPath $Mt5Exe
  Start-Sleep -Seconds 12
}

if (-not $env:MT5_TRADE_PORT) { $env:MT5_TRADE_PORT = "9530" }
if (-not $env:MT5_TRADE_BIND_HOST) { $env:MT5_TRADE_BIND_HOST = "127.0.0.1" }

Write-Host "[trade] MT5_PATH=$($env:MT5_PATH)"
Write-Host "[trade] bind=$($env:MT5_TRADE_BIND_HOST):$($env:MT5_TRADE_PORT)"

Set-Location $ProjectRoot
python bridge/mt5_trading_service.py
