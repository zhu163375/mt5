# Linux 部署指南（行情聚合 + 统一入口）

Linux 只跑 **Node 网关**，不跑 MT5。行情由 Windows bridge TCP push 进来；交易以 **router** 模式转发到各 Windows 网关。

---

## 1. 前置条件

- Ubuntu 20.04+ / Debian
- Node.js 18+
- PM2（`npm i -g pm2`）
- Windows bridge 已配置 `MT5_TCP_HOST=<本机公网IP>`

---

## 2. 安装

```bash
sudo mkdir -p /opt/mt5_project
sudo chown $USER:$USER /opt/mt5_project
cd /opt/mt5_project
git clone https://github.com/zhu163375/mt5.git .
# 或 rsync / scp 同步代码

cp deploy/config.linux.env.example deploy/config.env
cp deploy/accounts.json.example deploy/accounts.json
nano deploy/accounts.json   # 填写 Windows gateway 地址
```

---

## 3. 防火墙

```bash
# 仅允许 Windows bridge IP 推送行情
sudo ufw allow from <Windows公网IP> to any port 9627

# 业务访问 HTTP（或用 nginx 反代）
sudo ufw allow 9628/tcp
# 更安全：sudo ufw allow from <业务服务器IP> to any port 9628
```

---

## 4. 启动

```bash
pm2 start ecosystem.linux.config.cjs
pm2 save
pm2 startup
```

可选环境变量（写入 `ecosystem.linux.config.cjs` 或 `deploy/config.env`）：

```ini
MT5_GATEWAY_API_KEY=your-secret
MT5_GATEWAY_IP_WHITELIST=业务服务器IP
```

---

## 5. 验证

```bash
curl -s http://127.0.0.1:9628/health
curl -s http://127.0.0.1:9628/quotes
```

期望：

```json
{"ok":true,"quotes":3,"mode":"router","backends":[{"accountId":"60100824","ok":true,...}]}
```

`backends[].ok` 为 `false` 表示 Linux 无法访问对应 Windows `:9628`，见 [deploy-remote-windows.md](./deploy-remote-windows.md) 第 6 节。

---

## 6. 一键脚本（可选）

```bash
sudo APP_DIR=/opt/mt5_project USE_DOCKER=0 bash deploy/linux/install.sh
```

Docker 方式见 `deploy/linux/docker-compose.yml`。
