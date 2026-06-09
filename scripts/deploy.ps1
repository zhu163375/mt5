$ErrorActionPreference = "Stop"

function Get-Mt5DataExpertsDir {
  param([string]$Mt5Root)
  $terminalRoot = Join-Path $env:APPDATA "MetaQuotes\Terminal"
  if (-not (Test-Path $terminalRoot)) { return $null }

  Get-ChildItem $terminalRoot -Directory | ForEach-Object {
    $originFile = Join-Path $_.FullName "origin.txt"
    if (-not (Test-Path $originFile)) { return }

    $origin = (Get-Content $originFile -Raw).Trim()
    if ($origin -eq $Mt5Root) {
      return (Join-Path $_.FullName "MQL5\Experts")
    }
  } | Select-Object -First 1
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Mt5Root = Join-Path (Split-Path -Parent $ProjectRoot) "MT5"
$SourceEa = Join-Path $ProjectRoot "mql5\Experts\QuotePusher.mq5"
$InstallExperts = Join-Path $Mt5Root "MQL5\Experts"
$DataExperts = Get-Mt5DataExpertsDir -Mt5Root $Mt5Root
$MetaEditor = Join-Path $Mt5Root "MetaEditor64.exe"

if (-not (Test-Path $Mt5Root)) { throw "MT5 dir not found: $Mt5Root" }
if (-not (Test-Path $SourceEa)) { throw "EA source not found: $SourceEa" }
if (-not (Test-Path $MetaEditor)) { throw "MetaEditor not found: $MetaEditor" }

$deployTargets = @($InstallExperts)
if ($DataExperts) {
  $deployTargets += $DataExperts
} else {
  Write-Host "[deploy] warn: MT5 data folder not found in AppData, only install dir will be updated"
}

foreach ($targetDir in $deployTargets) {
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  $targetEa = Join-Path $targetDir "QuotePusher.mq5"
  Copy-Item -Force $SourceEa $targetEa
  Write-Host "[deploy] copied EA -> $targetEa"

  $logFile = Join-Path $targetDir "QuotePusher.log"
  & $MetaEditor /compile:$targetEa /log | Out-Null
  Start-Sleep -Seconds 2

  if (Test-Path $logFile) { Get-Content $logFile | Write-Host }

  $ex5 = Join-Path $targetDir "QuotePusher.ex5"
  if (-not (Test-Path $ex5)) { throw "EA compile failed, see log: $logFile" }
  Write-Host "[deploy] compiled -> $ex5"

  $advisorsDir = Join-Path $targetDir "Advisors"
  New-Item -ItemType Directory -Force -Path $advisorsDir | Out-Null
  Copy-Item -Force $targetEa (Join-Path $advisorsDir "QuotePusher.mq5")
  Copy-Item -Force $ex5 (Join-Path $advisorsDir "QuotePusher.ex5")
  Write-Host "[deploy] also copied -> $advisorsDir\QuotePusher.ex5"
}

Write-Host "[deploy] refresh MT5 Navigator: right-click 'EA trading' -> Refresh, or restart MT5"
Write-Host "[deploy] MT5 uses AppData data folder, not install folder MQL5"
