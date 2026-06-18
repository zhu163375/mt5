# 远程 Windows 部署指南

在 **Windows 云主机或远程桌面** 上运行 MT5 + Python bridge + Node 网关，向 Linux 推送行情，并承接 Linux 路由过来的交易请求。

---

## 1. 前置条件

| 项目 | 要求 |
|------|------|
| 系统 | Windows 10/11 或 Windows Server |
| Node.js | 18+（安装时勾选 Add to PATH） |
| Python | 3.10+ **64 位** |
| MetaTrader 5 | 已安装、已登录 |
| Linux 行情机 | 已部署，TCP **9627** 对 Windows 公网 IP 放行 |

```powershell
node -v
python --version
python -c "import platform; print(platform.architecture())"   # 应 64bit
```

---

## 2. 获取代码

```powershell
cd C:\
git clone https://github.com/zhu163375/mt5.git mt5_project
cd C:\mt5_project
```

无 git：GitHub 下载 ZIP 解压到 `C:\mt5_project`。

---

## 3. 配置

```powershell
copy deploy\config.windows.env.example deploy\config.env
notepad deploy\config.env
```

**必改：**

```ini
MT5_PATH=C:\Program Files\MetaTrader 5\terminal64.exe
MT5_TCP_HOST=43.99.61.45          # Linux 公网 IP
MT5_BIND_HOST=0.0.0.0             # Linux 要路由交易时（见第 6 节）
```

---

## 4. 安装依赖

```powershell
cd C:\mt5_project
python -m pip install -r bridge\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
npm install -g pm2
```

可选一键脚本（pip + 生成 config.env + 装 pm2）：

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1
```

---

## 5. MT5 准备

1. 启动 MT5 并登录（如 `60100824`）
2. 打开 **AutoTrading（算法交易）**（否则下单 `retcode=10027`）
3. 报价窗口添加：`XAUUSD`、`XAGUSD`、`USDCNH`
4. `deploy\config.env` 中 `MT5_PATH` 指向当前使用的 `terminal64.exe`

---

## 6. 网络与防火墙

**行情（必须）** — Windows bridge 出站 → Linux `9627`：

```bash
sudo ufw allow from <Windows公网IP> to any port 9627
```

**交易（必须）** — Linux router 入站 → Windows `9628`：

| 环境 | 做法 |
|------|------|
| 云 Windows | `MT5_BIND_HOST=0.0.0.0`，防火墙仅放行 Linux IP |
| 家庭宽带 | 需端口映射 / Tailscale / VPN |

```powershell
New-NetFirewallRule -DisplayName "MT5 Gateway from Linux" `
  -Direction Inbound -Protocol TCP -LocalPort 9628 `
  -RemoteAddress 43.99.61.45 -Action Allow
```

Linux `deploy/accounts.json`：

```json
{
  "60100824": {
    "gateway": "http://<Windows可达IP>:9628",
    "enabled": true
  }
}
```

---

## 7. 启动服务

```powershell
cd C:\mt5_project
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

三个进程应为 **online**：

| 名称 | 作用 |
|------|------|
| `mt5-quotes` | HTTP 9628 |
| `mt5-bridge` | 行情 push → Linux 9627 |
| `mt5-trade` | 交易 RPC 9530（本机） |

常用命令：

```powershell
pm2 status
pm2 logs mt5-bridge --lines 50
pm2 restart all
pm2 stop all
```

也可用 npm 脚本：

```powershell
npm run pm2:win
npm run pm2:status
npm run pm2:logs
```

---

## 8. 验证

```powershell
(Invoke-WebRequest http://127.0.0.1:9628/health -UseBasicParsing).Content
```

浏览器：`http://127.0.0.1:9628/`

```powershell
$env:MT5_GATEWAY_BASE_URL = "http://127.0.0.1:9628"
node examples\test-trade-readonly.js
```

Linux 侧：

```bash
curl -s http://127.0.0.1:9628/health
curl -s http://127.0.0.1:9628/quotes
```

---

## 9. 联调清单

- [ ] `pm2 logs mt5-bridge` 无 Connection refused
- [ ] Linux `/health` → `quotes` ≥ 1
- [ ] Linux 能访问 Windows `:9628`
- [ ] MT5 AutoTrading 已开
- [ ] router 模式下 `backends[].ok: true`

---

## 10. 故障排查

| 现象 | 处理 |
|------|------|
| `requirements.txt` 找不到 | 先 `cd C:\mt5_project` |
| `python` 找不到 | 重装 Python 并勾选 Add to PATH |
| Linux quotes=0 | 查 bridge 日志；Linux 放行 9627 |
| 交易 502 | Linux 访问不到 Win:9628 |
| 端口占用 | `pm2 delete all` 后重新 `pm2 start` |

---

## 11. 更新

```powershell
cd C:\mt5_project
git pull
python -m pip install -r bridge\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
pm2 restart all
```

---

## 附录：手动调试（不用 PM2）

```powershell
python bridge\mt5_trading_service.py   # 终端 1
python bridge\mt5_bridge.py              # 终端 2
node src\start-server.js                 # 终端 3
```
