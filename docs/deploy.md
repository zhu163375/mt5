# MT5 网关部署总览

## 架构

```
业务 (gold-metaapi-node)
    │  HTTP 9628 + Header X-Account-Id
    ▼
Linux 统一入口 (43.99.61.45)          MT5_TRADE_MODE=router
    │  行情聚合 (TCP 9627 收 push)
    │  交易路由 → accounts.json
    ▼
Windows 远程机 (MT5 + 网关)           MT5_TRADE_MODE=local
    ├── mt5-bridge  → push 行情到 Linux:9627
    ├── mt5-quotes  → HTTP 9628（本机交易 + 可选对外）
    └── mt5-trade   → Python 9530（仅本机）
```

| 端口 | 位置 | 用途 | 谁访问 |
|------|------|------|--------|
| **9627** TCP | Linux | 接收 Windows bridge 推送行情 | Windows 出站 |
| **9628** HTTP | Linux / Windows | 行情 API、Swagger、`/rpc/*` | 业务、Linux 路由 |
| **9530** HTTP | Windows 本机 | Python 交易 RPC | 仅 Node 本机代理 |

## 配置文件

| 文件 | 用途 |
|------|------|
| [deploy/config.windows.env.example](../deploy/config.windows.env.example) | **远程 Windows** 专用 |
| [deploy/config.linux.env.example](../deploy/config.linux.env.example) | Linux 统一入口 |
| [deploy/accounts.json.example](../deploy/accounts.json.example) | Linux router 账户 → Windows 网关映射 |

复制对应 example 为 `deploy/config.env` 后修改。

## 部署文档

| 场景 | 文档 |
|------|------|
| **远程 Windows（单账户）** | [deploy-remote-windows.md](./deploy-remote-windows.md) |
| **远程 Windows（双账户）** | [deploy-windows-dual-accounts.md](./deploy-windows-dual-accounts.md) |
| Linux 行情机 / 统一入口 | [deploy-linux.md](./deploy-linux.md) |

## 快速验证

```powershell
# Windows 本机
Invoke-WebRequest http://127.0.0.1:9628/health -UseBasicParsing
node examples/run-api-tests.js
```

```bash
# Linux
curl -s http://127.0.0.1:9628/health
curl -s http://127.0.0.1:9628/quotes
```

## 业务侧配置 (gold-metaapi-node)

```ini
MT_TRADE_MODE=local
MT5_GATEWAY_BASE_URL=http://<Linux公网IP>:9628
# 请求头: X-Account-Id: <MT5登录号>
```

Linux `deploy/accounts.json` 中该账户的 `gateway` 必须指向 **Windows 可从 Linux 访问的地址**（见 Windows 部署文档「网络」一节）。
