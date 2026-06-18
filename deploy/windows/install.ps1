# 远程 Windows 一键安装：Python 依赖 + config.env + PM2
# 用法: powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$DeployDir = Join-Path $ProjectRoot "deploy"
$ConfigExample = Join-Path $DeployDir "config.windows.env.example"
$ConfigFile = Join-Path $DeployDir "config.env"

function Write-Step([string]$Msg) { Write-Host "`n==> $Msg" -ForegroundColor Cyan }

Write-Step "Project: $ProjectRoot"
Set-Location $ProjectRoot

Write-Step "Check Python 64-bit"
python --version
python -c "import platform; a=platform.architecture()[0]; assert a=='64bit', f'need 64-bit Python, got {a}'; print('Python arch OK')"

Write-Step "pip install bridge requirements"
python -m pip install -r (Join-Path $ProjectRoot "bridge\requirements.txt") -i https://pypi.tuna.tsinghua.edu.cn/simple
python -c "import MetaTrader5 as mt5; print('MetaTrader5 OK')"

if (-not (Test-Path $ConfigFile)) {
  Copy-Item $ConfigExample $ConfigFile
  Write-Host "Created deploy/config.env — edit MT5_PATH and MT5_TCP_HOST before start"
} else {
  Write-Host "deploy/config.env already exists, skipped"
}

Write-Step "Install PM2"
npm install -g pm2
pm2 --version

Write-Step "Done"
Write-Host @"

Next steps:
  1. notepad deploy\config.env
  2. Start MT5, login, enable AutoTrading
  3. pm2 start ecosystem.config.cjs
  4. pm2 save

Docs: docs\deploy-remote-windows.md

"@
