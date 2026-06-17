配置 config.env

cd C:\mt5_project
python --version
python -c "import platform; print(platform.architecture())"
python -m pip install MetaTrader5 -i https://pypi.org/simple
python -c "import MetaTrader5 as mt5; print('OK')"
python bridge\mt5_bridge.py

## 阶段 1：本地交易 RPC（MetaApi 兼容）

Windows 网关启用交易：

```ini
# deploy/config.env
MT5_TRADE_ENABLED=1
MT5_TRADE_PORT=9530
MT5_TRADE_URL=http://127.0.0.1:9530
```

安装依赖并启动：

```powershell
python -m pip install -r bridge/requirements.txt -i https://pypi.org/simple
npm run trade          # Python 9530
npm run start          # Node 9628，代理 /rpc/*
npm run trade:test     # 只读测试账户/持仓
```

`gold-metaapi-node` 切换本地模式：

```ini
MT_TRADE_MODE=local
MT5_GATEWAY_BASE_URL=http://WindowsIP:9628
```

交易 RPC 路径：`/rpc/create_market_buy_order`、`/rpc/get_positions` 等（见 `src/trading-routes.js`）。

**Swagger 文档：** 启动 Node 后打开 http://127.0.0.1:9628/docs  
OpenAPI JSON：http://127.0.0.1:9628/openapi.json  
Python 交易层文档（内网）：http://127.0.0.1:9530/docs
