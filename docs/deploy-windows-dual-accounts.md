# 一台 Windows 部署两个 MT5 账户

同一台 Windows 上跑 **两个 MT5 终端 + 两套网关**，Linux router 按 `X-Account-Id` 转发到不同端口。

---

## 架构

```
Linux 43.99.61.45:9628 (router)
    │
    ├── X-Account-Id: 60100824  →  Windows:9628  →  MT5-A  →  trade:9530
    │
    └── X-Account-Id: 60100825  →  Windows:9629  →  MT5-B  →  trade:9531

Windows（仅 1 个 bridge 推行情到 Linux:9627）
    mt5-bridge  →  Linux:9627  （连 MT5-A 读 tick 即可）
```

| 组件 | 账户 A | 账户 B |
|------|--------|--------|
| MT5 目录 | `C:\MT5-A` portable | `C:\MT5-B` portable |
| HTTP 网关 | **9628** | **9629** |
| Python 交易 | **9530** | **9531** |
| PM2 进程 | mt5-quotes-a / mt5-trade-a | mt5-quotes-b / mt5-trade-b |

---

## 第一步：准备两个 portable MT5

每个账户 **单独一个 MT5 目录**，避免数据混在一起。

### 1.1 创建目录

```powershell
mkdir C:\MT5-A
mkdir C:\MT5-B
```

### 1.2 安装 MT5 到 A（portable）

1. 从券商下载 MT5 安装包  
2. 安装或解压到 `C:\MT5-A\`  
3. **首次启动必须带 portable 参数：**

```powershell
Start-Process "C:\MT5-A\terminal64.exe" -ArgumentList "/portable"
```

4. 登录 **账户 A**（如 `60100824`）  
5. 打开 **AutoTrading**，添加报价品种 `XAUUSD,XAGUSD,USDCNH`

### 1.3 安装 MT5 到 B

```powershell
# 复制安装文件到 B，或再装一份到 C:\MT5-B
Start-Process "C:\MT5-B\terminal64.exe" -ArgumentList "/portable"
```

登录 **账户 B**（如 `60100825`），同样开 AutoTrading、加品种。

> 两个 MT5 要 **同时保持运行**（各开一个窗口，或最小化）。

### 1.4 验证路径

```powershell
Test-Path C:\MT5-A\terminal64.exe
Test-Path C:\MT5-B\terminal64.exe
```

---

## 第二步：项目与依赖

```powershell
cd C:\mt5_project
git pull

python -m pip install -r bridge\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
npm install -g pm2
```

---

## 第三步：配置文件

```powershell
cd C:\mt5_project\deploy

copy config.windows.accountA.env.example config.accountA.env
copy config.windows.accountB.env.example config.accountB.env
copy config.bridge.env.example config.bridge.env

notepad config.accountA.env
notepad config.accountB.env
notepad config.bridge.env
```

**必改项：**

`config.accountA.env`：

```ini
MT5_PATH=C:\MT5-A\terminal64.exe
MT5_HTTP_PORT=9628
MT5_TRADE_PORT=9530
MT5_TRADE_URL=http://127.0.0.1:9530
MT5_TCP_HOST=43.99.61.45
```

`config.accountB.env`：

```ini
MT5_PATH=C:\MT5-B\terminal64.exe
MT5_HTTP_PORT=9629
MT5_TRADE_PORT=9531
MT5_TRADE_URL=http://127.0.0.1:9531
MT5_TRADE_MAGIC=880002
```

`config.bridge.env`（行情用 A 即可）：

```ini
MT5_PATH=C:\MT5-A\terminal64.exe
MT5_TCP_HOST=43.99.61.45
```

---

## 第四步：Windows 防火墙

允许 Linux **仅访问两个网关端口**（替换 Linux IP）：

```powershell
$LinuxIp = "43.99.61.45"

New-NetFirewallRule -DisplayName "MT5 Gateway A" `
  -Direction Inbound -Protocol TCP -LocalPort 9628 `
  -RemoteAddress $LinuxIp -Action Allow

New-NetFirewallRule -DisplayName "MT5 Gateway B" `
  -Direction Inbound -Protocol TCP -LocalPort 9629 `
  -RemoteAddress $LinuxIp -Action Allow
```

9530 / 9531 **不要对公网开放**（只本机）。

---

## 第五步：启动 PM2（双账户）

若之前跑过单账户，先停掉：

```powershell
cd C:\mt5_project
pm2 delete all
```

启动双账户栈（**5 个进程**）：

```powershell
pm2 start ecosystem.windows.dual.config.cjs
pm2 save
pm2 status
```

应看到：

| 进程 | 作用 |
|------|------|
| mt5-bridge | 行情 → Linux:9627 |
| mt5-quotes-a | 账户 A 网关 :9628 |
| mt5-trade-a | 账户 A 交易 :9530 |
| mt5-quotes-b | 账户 B 网关 :9629 |
| mt5-trade-b | 账户 B 交易 :9531 |

---

## 第六步：本机验证（Windows）

```powershell
# 账户 A
(Invoke-WebRequest http://127.0.0.1:9628/health -UseBasicParsing).Content
curl.exe -s -H "X-Account-Id: 60100824" http://127.0.0.1:9628/rpc/get_account_information

# 账户 B
(Invoke-WebRequest http://127.0.0.1:9629/health -UseBasicParsing).Content
curl.exe -s -H "X-Account-Id: 60100825" http://127.0.0.1:9629/rpc/get_account_information
```

两个都应返回各自 `login` 号。

---

## 第七步：Linux 配置 accounts.json

SSH 到 Linux：

```bash
cd /opt/mt5_project
nano deploy/accounts.json
```

内容（**gateway 填 Windows 公网 IP**）：

```json
{
  "default": "60100824",
  "60100824": {
    "gateway": "http://81.71.103.77:9628",
    "label": "demo-A",
    "enabled": true
  },
  "60100825": {
    "gateway": "http://81.71.103.77:9629",
    "label": "demo-B",
    "enabled": true
  }
}
```

重启 Linux：

```bash
pm2 restart mt5-quotes
curl -s http://127.0.0.1:9628/health | python3 -m json.tool
```

期望两个 backend 都是 `"ok": true`。

---

## 第八步：从 Linux 测两个账户

```bash
# 账户 A
curl -s -H "X-Account-Id: 60100824" \
  http://127.0.0.1:9628/rpc/get_account_information

# 账户 B
curl -s -H "X-Account-Id: 60100825" \
  http://127.0.0.1:9628/rpc/get_account_information
```

下单测试（demo 小仓位）：

```bash
curl -s -X POST http://127.0.0.1:9628/rpc/create_market_buy_order \
  -H "Content-Type: application/json" \
  -H "X-Account-Id: 60100824" \
  -d '{"symbol":"XAUUSD","volume":0.01,"comment":"dual-a"}'

curl -s -X POST http://127.0.0.1:9628/rpc/create_market_buy_order \
  -H "Content-Type: application/json" \
  -H "X-Account-Id: 60100825" \
  -d '{"symbol":"XAUUSD","volume":0.01,"comment":"dual-b"}'
```

---

## 业务侧

统一仍走 Linux 一个地址，靠 Header 区分账户：

```ini
MT5_GATEWAY_BASE_URL=http://43.99.61.45:9628
```

```http
X-Account-Id: 60100824   # 或 60100825
```

---

## 日常运维

```powershell
# 看状态
pm2 status

# 看日志
pm2 logs mt5-trade-a --lines 30
pm2 logs mt5-trade-b --lines 30
pm2 logs mt5-bridge --lines 30

# 更新代码后
cd C:\mt5_project
git pull
pm2 restart ecosystem.windows.dual.config.cjs

# Linux
cd /opt/mt5_project && git pull && pm2 restart mt5-quotes
```

---

## 故障排查

| 现象 | 处理 |
|------|------|
| trade-a 正常、trade-b 失败 | B 的 MT5 是否登录；`MT5_PATH` 是否指向 `C:\MT5-B` |
| Linux backend B 超时 | 防火墙是否放行 **9629**；`accounts.json` gateway 端口是否为 9629 |
| 两个账户查到同一 login | 两个 trade 连了同一个 MT5，检查 `MT5_PATH` |
| bridge stopped | MT5-A 未开；看 `pm2 logs mt5-bridge` |
| 端口占用 | `netstat -ano \| findstr 9628`；`pm2 delete all` 后重启 |

---

## 从单账户迁移

1. 把现有 `deploy/config.env` 内容迁到 `config.accountA.env`  
2. 新建 `C:\MT5-B` + `config.accountB.env`  
3. `pm2 delete all`  
4. `pm2 start ecosystem.windows.dual.config.cjs`  
5. Linux `accounts.json` 增加 B 的 gateway `:9629`

---

## 配置文件模板

| 文件 | 说明 |
|------|------|
| [config.windows.accountA.env.example](../deploy/config.windows.accountA.env.example) | 账户 A |
| [config.windows.accountB.env.example](../deploy/config.windows.accountB.env.example) | 账户 B |
| [config.bridge.env.example](../deploy/config.bridge.env.example) | 行情 bridge |
| [accounts.dual.json.example](../deploy/accounts.dual.json.example) | Linux 路由 |
| [ecosystem.windows.dual.config.cjs](../ecosystem.windows.dual.config.cjs) | PM2 双账户 |

单账户部署见 [deploy-remote-windows.md](./deploy-remote-windows.md)。
