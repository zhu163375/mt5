# Windows 部署

完整步骤见 **[docs/deploy-remote-windows.md](../../docs/deploy-remote-windows.md)**。

## 最快路径

```powershell
cd C:\mt5_project
powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1
notepad deploy\config.env
pm2 start ecosystem.config.cjs
pm2 status
```

## 配置模板

- [config.windows.env.example](../config.windows.env.example)

## 单进程调试（不用 PM2）

| 脚本 | 作用 |
|------|------|
| [start-bridge.ps1](./start-bridge.ps1) | 仅行情 bridge |
| [start-trade.ps1](./start-trade.ps1) | 仅 Python 交易 |
