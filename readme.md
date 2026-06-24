# MT5 行情与交易网关

从 MetaTrader 5 推送实时行情到 Linux，并提供 MetaApi 兼容的 HTTP 交易 RPC。

## 架构简述

- **Linux**：行情聚合 + 统一 HTTP 入口（router 模式）
- **Windows**：MT5 + Python bridge + 本机交易网关（local 模式）

详细架构与端口说明 → **[docs/deploy.md](docs/deploy.md)**

## 部署文档

| 场景 | 文档 |
|------|------|
| **远程 Windows（推荐先看）** | [docs/deploy-remote-windows.md](docs/deploy-remote-windows.md) |
| **Windows 双账户** | [docs/deploy-windows-dual-accounts.md](docs/deploy-windows-dual-accounts.md) |
| Linux 行情机 / 统一入口 | [docs/deploy-linux.md](docs/deploy-linux.md) |

## 配置

```powershell
# Windows
copy deploy\config.windows.env.example deploy\config.env

# Linux
copy deploy\config.linux.env.example deploy\config.env
copy deploy\accounts.json.example deploy\accounts.json
```

## 常用命令

```powershell
# Windows — 一键安装 + PM2 启动（见 deploy-remote-windows.md）
powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1
pm2 start ecosystem.config.cjs
```

```bash
# Linux
pm2 start ecosystem.linux.config.cjs
```

```powershell
# 验证
Invoke-WebRequest http://127.0.0.1:9628/health -UseBasicParsing
node examples\run-api-tests.js
```

## API 文档

启动 Node 后：

- Swagger UI: http://127.0.0.1:9628/docs
- OpenAPI: http://127.0.0.1:9628/openapi.json
- 仪表盘: http://127.0.0.1:9628/

业务侧（gold-metaapi-node）：

```ini
MT_TRADE_MODE=local
MT5_GATEWAY_BASE_URL=http://<LinuxIP>:9628
# Header: X-Account-Id: <MT5账户号>
```
