/** PM2 config for Linux quote server only */
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
        MT5_TCP_PORT: "9527",
        MT5_HTTP_PORT: "9528",
      },
    },
  ],
};
