$ErrorActionPreference = "Stop"

Write-Host "=== MT5 Quote Status ==="

$node = Get-NetTCPConnection -LocalPort 9628 -State Listen -ErrorAction SilentlyContinue
$bridge = Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%mt5_bridge.py%'" -ErrorAction SilentlyContinue
$mt5 = Get-CimInstance Win32_Process -Filter "Name='terminal64.exe'" -ErrorAction SilentlyContinue

Write-Host ("Node 9628 : " + ($(if ($node) { "running" } else { "stopped" })))
Write-Host ("Bridge    : " + ($(if ($bridge) { "running pid=$($bridge.ProcessId)" } else { "stopped" })))
Write-Host ("MT5       : " + ($(if ($mt5) { "running" } else { "stopped" })))

if ($node) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:9628/health" -TimeoutSec 3
    Write-Host "Quotes    : $($health.quotes)"
    if ($health.quotes -gt 0) {
      $list = Invoke-RestMethod -Uri "http://127.0.0.1:9628/quotes" -TimeoutSec 3
      foreach ($q in @($list)) {
        Write-Host ("  {0} bid={1} ask={2}" -f $q.symbol, $q.bid, $q.ask)
      }
      Write-Host "Browser   : http://127.0.0.1:9628/"
    } else {
      Write-Host "No data. Run: npm run auto"
    }
  } catch {
    Write-Host "HTTP error: $($_.Exception.Message)"
  }
} else {
  Write-Host "Run: npm run auto"
}
