/**
 * Windows 双账户 PM2 配置
 * 用法: pm2 start ecosystem.windows.dual.config.cjs
 *
 * 配置文件:
 *   deploy/config.accountA.env  账户 A（9628 / 9530）
 *   deploy/config.accountB.env  账户 B（9629 / 9531）
 *   deploy/config.bridge.env    行情 bridge（可选，默认读 accountA 的 MT5 与 Linux IP）
 */
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

const deployDir = path.join(root, "deploy");
const accountA = loadEnvFile(path.join(deployDir, "config.accountA.env"));
const accountB = loadEnvFile(path.join(deployDir, "config.accountB.env"));
const bridgeEnv = fs.existsSync(path.join(deployDir, "config.bridge.env"))
  ? loadEnvFile(path.join(deployDir, "config.bridge.env"))
  : accountA;

/** @param {Record<string, string>} env @param {Record<string, string>} defaults */
function pick(env, defaults) {
  return { ...defaults, ...env };
}

/** @param {string} name @param {Record<string, string>} env */
function quotesApp(name, env) {
  const tradeEnabled = String(env.MT5_TRADE_ENABLED ?? "1");
  const tradeUrl = env.MT5_TRADE_URL || "http://127.0.0.1:9530";
  return {
    name,
    cwd: root,
    script: "src/start-server.js",
    interpreter: "node",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_restarts: 20,
    env: {
      NODE_ENV: "production",
      MT5_BIND_HOST: env.MT5_BIND_HOST || "0.0.0.0",
      MT5_TCP_PORT: env.MT5_TCP_PORT || "9627",
      MT5_HTTP_PORT: env.MT5_HTTP_PORT || "9628",
      MT5_TRADE_ENABLED: tradeEnabled,
      MT5_TRADE_MODE: env.MT5_TRADE_MODE || "local",
      MT5_TRADE_URL: tradeUrl,
    },
  };
}

/** @param {string} name @param {Record<string, string>} env */
function tradeApp(name, env) {
  return {
    name,
    cwd: root,
    script: "bridge/mt5_trading_service.py",
    interpreter: "python",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_restarts: 20,
    env: {
      NODE_ENV: "production",
      MT5_PATH: env.MT5_PATH || "",
      MT5_TRADE_BIND_HOST: env.MT5_TRADE_BIND_HOST || "127.0.0.1",
      MT5_TRADE_PORT: env.MT5_TRADE_PORT || "9530",
      MT5_TRADE_MAGIC: env.MT5_TRADE_MAGIC || "880001",
      MT5_TRADE_DEVIATION: env.MT5_TRADE_DEVIATION || "20",
    },
  };
}

/** @type {import('pm2').StartOptions[]} */
const apps = [
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
      MT5_PATH: bridgeEnv.MT5_PATH || accountA.MT5_PATH || "",
      MT5_TCP_HOST: bridgeEnv.MT5_TCP_HOST || accountA.MT5_TCP_HOST || "127.0.0.1",
      MT5_TCP_PORT: bridgeEnv.MT5_TCP_PORT || "9627",
      MT5_SYMBOLS: bridgeEnv.MT5_SYMBOLS || accountA.MT5_SYMBOLS || "XAUUSD,XAGUSD,USDCNH",
      MT5_POLL_MS: bridgeEnv.MT5_POLL_MS || "200",
    },
  },
  quotesApp("mt5-quotes-a", accountA),
  tradeApp("mt5-trade-a", accountA),
  quotesApp("mt5-quotes-b", accountB),
  tradeApp("mt5-trade-b", accountB),
];

module.exports = { apps };
