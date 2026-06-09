$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Mt5Root = Join-Path (Split-Path -Parent $ProjectRoot) "MT5"
$Terminal = Join-Path $Mt5Root "terminal64.exe"

Write-Host "[start] deploying EA..."
& (Join-Path $PSScriptRoot "deploy.ps1")

Write-Host "[start] starting Node quote server..."
$nodeJob = Start-Job -ScriptBlock {
  param($root)
  Set-Location $root
  node src/server.js
} -ArgumentList $ProjectRoot

Start-Sleep -Seconds 2
try {
  $health = Invoke-WebRequest -Uri "http://127.0.0.1:9528/health" -UseBasicParsing -TimeoutSec 5
  Write-Host "[start] Node ready: $($health.Content)"
} catch {
  Receive-Job $nodeJob -Keep | Write-Host
  throw "Node server failed to start"
}

if (Test-Path $Terminal) {
  Write-Host "[start] launching MT5 /portable..."
  Start-Process -FilePath $Terminal -ArgumentList "/portable"
} else {
  Write-Host "[warn] terminal64.exe not found: $Terminal"
}

Write-Host "[start] Node TCP 127.0.0.1:9527"
Write-Host "[start] Node HTTP http://127.0.0.1:9528/quote/XAUUSD"
Write-Host "[start] stop Node: Stop-Job -Id $($nodeJob.Id); Remove-Job -Id $($nodeJob.Id) -Force"
