/** PM2 config for Linux unified gateway (quotes + account router) */
module.exports = {
  apps: [
    {
      name: "mt5-quotes",
      cwd: __dirname,
      script: "src/start-server.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "production",
        MT5_BIND_HOST: "0.0.0.0",
        MT5_TCP_PORT: "9627",
        MT5_HTTP_PORT: "9628",
        MT5_TRADE_ENABLED: "1",
        MT5_TRADE_MODE: "router",
        MT5_ACCOUNT_MAP: require("node:path").join(__dirname, "deploy", "accounts.json"),
        MT5_REQUIRE_ACCOUNT_ID: "1",
        MT5_BACKEND_PROBE_MS: "3000",
      },
    },
  ],
};
