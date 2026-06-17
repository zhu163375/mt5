$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Mt5Exe = Join-Path (Split-Path -Parent $ProjectRoot) "MT5\terminal64.exe"

function Test-PortListening([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-Path $Mt5Exe)) {
  throw "MT5 not found: $Mt5Exe"
}

if (-not (Get-CimInstance Win32_Process -Filter "Name='terminal64.exe'" -ErrorAction SilentlyContinue)) {
  Write-Host "[auto] starting MT5..."
  Start-Process -FilePath $Mt5Exe
  Start-Sleep -Seconds 8
}

if (-not (Test-PortListening 9628)) {
  Write-Host "[auto] starting Node quote server..."
  Start-Process -WindowStyle Minimized -FilePath "node" -ArgumentList "src/start-server.js" -WorkingDirectory $ProjectRoot
  Start-Sleep -Seconds 2
}

if (-not (Test-PortListening 9628)) {
  throw "Node server failed to start on port 9628"
}

Write-Host "[auto] starting Python MT5 bridge..."
$bridge = Start-Process -PassThru -WindowStyle Minimized -FilePath "python" `
  -ArgumentList "bridge/mt5_bridge.py" -WorkingDirectory $ProjectRoot

Start-Sleep -Seconds 3

$health = Invoke-WebRequest -Uri "http://127.0.0.1:9628/health" -UseBasicParsing
Write-Host "[auto] health: $($health.Content)"

try {
  $quote = Invoke-WebRequest -Uri "http://127.0.0.1:9628/quote/XAUUSD" -UseBasicParsing
  Write-Host "[auto] XAUUSD: $($quote.Content)"
} catch {
  Write-Host "[auto] XAUUSD not ready yet: $($_.Exception.Message)"
}

Write-Host "[auto] bridge pid: $($bridge.Id)"
Write-Host "[auto] test: npm run quote -- XAUUSD"
