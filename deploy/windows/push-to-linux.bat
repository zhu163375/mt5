@echo off
setlocal

set "MT5_PATH=E:\workspace\服务器\MT5\terminal64.exe"
set "MT5_TCP_HOST=47.86.17.193"
set "MT5_TCP_PORT=9627"
set "MT5_SYMBOLS=XAUUSD,XAGUSD,USDCNH"

cd /d "%~dp0..\.."
python bridge\mt5_bridge.py
