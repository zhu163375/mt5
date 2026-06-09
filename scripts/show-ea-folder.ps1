$ErrorActionPreference = "Stop"

$Mt5Root = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "MT5"
$terminalRoot = Join-Path $env:APPDATA "MetaQuotes\Terminal"

Get-ChildItem $terminalRoot -Directory | ForEach-Object {
  $originFile = Join-Path $_.FullName "origin.txt"
  if (-not (Test-Path $originFile)) { return }
  $origin = (Get-Content $originFile -Raw).Trim()
  if ($origin -like "$Mt5Root*") {
    $experts = Join-Path $_.FullName "MQL5\Experts"
    Write-Host "Terminal: $origin"
    Write-Host "Data  : $experts"
    if (Test-Path $experts) {
      Get-ChildItem $experts -Recurse -Filter "QuotePusher.ex5" | ForEach-Object { Write-Host "  EA: $($_.FullName)" }
    }
    Write-Host ""
    Start-Process explorer.exe $experts
  }
}

Write-Host "If Explorer opened, look for QuotePusher.ex5"
Write-Host "In MT5 Navigator: EA trading -> Advisors -> QuotePusher"
