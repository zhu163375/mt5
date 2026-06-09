const path = require("node:path");
const fs = require("node:fs");

const root = __dirname;

/** @param {string} file */
function loadEnvFile(file) {
  /** @type {Record<string, string>} */
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

const deployEnv = loadEnvFile(path.join(root, "deploy", "config.env"));

/** @type {import('pm2').StartOptions[]} */
const apps = [
  {
    name: "mt5-quotes",
    cwd: root,
    script: "src/start-server.js",
    interpreter: "node",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_restarts: 20,
    env: {
      NODE_ENV: "production",
      MT5_BIND_HOST: deployEnv.MT5_BIND_HOST || "127.0.0.1",
      MT5_TCP_PORT: deployEnv.MT5_TCP_PORT || "9527",
      MT5_HTTP_PORT: deployEnv.MT5_HTTP_PORT || "9528",
    },
    env_production_linux: {
      NODE_ENV: "production",
      MT5_BIND_HOST: "0.0.0.0",
      MT5_TCP_PORT: "9527",
      MT5_HTTP_PORT: "9528",
    },
  },
  {
    name: "mt5-bridge",
    cwd: root,
    script: "bridge/mt5_bridge.py",
    interpreter: "python",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_restarts: 20,
    env: {
      NODE_ENV: "production",
      MT5_PATH: deployEnv.MT5_PATH || "",
      MT5_TCP_HOST: deployEnv.MT5_TCP_HOST || "127.0.0.1",
      MT5_TCP_PORT: deployEnv.MT5_TCP_PORT || "9527",
      MT5_SYMBOLS: deployEnv.MT5_SYMBOLS || "XAUUSD,XAGUSD,USDCNH",
      MT5_POLL_MS: deployEnv.MT5_POLL_MS || "200",
    },
  },
];

module.exports = { apps };
