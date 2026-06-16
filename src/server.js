import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleTradingRoutes, isTradeEnabled } from './trading-routes.js';
import { handleSwaggerRoutes } from './swagger.js';

const BIND_HOST = process.env.MT5_BIND_HOST || '127.0.0.1';
const TCP_PORT = Number(process.env.MT5_TCP_PORT || 9527);
const HTTP_PORT = Number(process.env.MT5_HTTP_PORT || 9528);
const QUOTE_TTL_MS = Number(process.env.MT5_QUOTE_TTL_MS || 60_000);
const QUOTE_PRUNE_MS = Number(process.env.MT5_QUOTE_PRUNE_MS || 10_000);

/** @type {Map<string, { symbol: string, bid: number, ask: number, time: number, updatedAt: number }>} */
const quotes = new Map();

function isQuoteFresh(quote, now = Date.now()) {
  return now - quote.updatedAt <= QUOTE_TTL_MS;
}

function getActiveQuotes() {
  const now = Date.now();
  return [...quotes.values()].filter((quote) => isQuoteFresh(quote, now));
}

function pruneStaleQuotes() {
  const now = Date.now();
  const removed = [];
  for (const [symbol, quote] of quotes) {
    if (!isQuoteFresh(quote, now)) {
      quotes.delete(symbol);
      removed.push(symbol);
    }
  }
  for (const symbol of removed) {
    broadcastSse('remove', { symbol });
  }
  return removed;
}

function startQuotePruner() {
  setInterval(pruneStaleQuotes, QUOTE_PRUNE_MS).unref();
}

/** @type {Set<import('node:http').ServerResponse>} */
const sseClients = new Set();
const SSE_HEARTBEAT_MS = 30_000;

function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastSse(event, data) {
  for (const client of sseClients) {
    try {
      sseWrite(client, event, data);
    } catch {
      sseClients.delete(client);
    }
  }
}

function startSseHeartbeat() {
  setInterval(() => {
    for (const client of sseClients) {
      try {
        client.write(': heartbeat\n\n');
      } catch {
        sseClients.delete(client);
      }
    }
  }, SSE_HEARTBEAT_MS).unref();
}

function handleSseStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  sseWrite(res, 'snapshot', getActiveQuotes());
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
}

/**
 * @param {string} line
 */
function handleLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  let payload;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    console.warn('[mt5] 无效 JSON:', trimmed);
    return;
  }

  if (payload.type !== 'quote' || !payload.symbol) return;

  quotes.set(payload.symbol, {
    symbol: payload.symbol,
    bid: Number(payload.bid),
    ask: Number(payload.ask),
    time: Number(payload.time || 0),
    updatedAt: Date.now(),
  });
  broadcastSse('quote', quotes.get(payload.symbol));
}

function startTcpServer() {
  const server = net.createServer((socket) => {
    console.log(`[mt5] EA 已连接: ${socket.remoteAddress}:${socket.remotePort}`);
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    });

    socket.on('close', () => {
      console.log('[mt5] EA 连接已断开');
    });

    socket.on('error', (err) => {
      console.error('[mt5] socket 错误:', err.message);
    });
  });

  server.listen(TCP_PORT, BIND_HOST, () => {
    console.log(`[mt5] TCP 服务监听 ${BIND_HOST}:${TCP_PORT}，等待行情推送`);
  }).on('error', (err) => {
    console.error(`[mt5] TCP 启动失败 ${BIND_HOST}:${TCP_PORT}`, err.message);
    console.error('[mt5] HTTP 仍会启动，可用 /health 检查服务状态');
  });

  return server;
}

function renderQuoteRows(list) {
  if (!list.length) {
    return '<tr><td colspan="5" class="empty">暂无数据，请运行 npm run auto</td></tr>';
  }
  return list
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((q) => {
      const age = Math.max(0, Math.round((Date.now() - q.updatedAt) / 1000));
      return `<tr data-symbol="${q.symbol}"><td>${q.symbol}</td><td>${q.bid}</td><td>${q.ask}</td><td>${(q.ask - q.bid).toFixed(5)}</td><td class="age">${age}s前</td></tr>`;
    })
    .join('');
}

function renderDashboard() {
  const rows = renderQuoteRows(getActiveQuotes());

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>MT5 行情</title>
<style>
body{font-family:Segoe UI,sans-serif;margin:24px;background:#0f172a;color:#e2e8f0}
h1{margin:0 0 8px}p{color:#94a3b8}
table{border-collapse:collapse;width:100%;max-width:720px;margin-top:16px}
th,td{border:1px solid #334155;padding:10px;text-align:left}
th{background:#1e293b}.empty{color:#f87171}
.status-live{color:#4ade80}.status-offline{color:#f87171}
</style></head><body>
<h1>MT5 实时行情</h1>
<p>SSE 推送 | 连接: <span id="status" class="status-offline">连接中...</span> | 品种数: <span id="count">${getActiveQuotes().length}</span> | API: <a href="/quotes" style="color:#38bdf8">/quotes</a> · <a href="/quotes/stream" style="color:#38bdf8">/quotes/stream</a></p>
<table><thead><tr><th>品种</th><th>Bid</th><th>Ask</th><th>Spread</th><th>更新</th></tr></thead>
<tbody id="rows">${rows}</tbody>
</table>
<script>
const quotes = new Map();

function renderRow(q) {
  const age = Math.max(0, Math.round((Date.now() - q.updatedAt) / 1000));
  const spread = (q.ask - q.bid).toFixed(5);
  return '<tr data-symbol="' + q.symbol + '"><td>' + q.symbol + '</td><td>' + q.bid + '</td><td>' + q.ask + '</td><td>' + spread + '</td><td class="age">' + age + 's前</td></tr>';
}

function renderTable() {
  const list = [...quotes.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  document.getElementById('count').textContent = list.length;
  const tbody = document.getElementById('rows');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无数据，请运行 npm run auto</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(renderRow).join('');
}

function upsertQuote(q) {
  quotes.set(q.symbol, q);
  const tbody = document.getElementById('rows');
  const empty = tbody.querySelector('.empty');
  if (empty) empty.remove();

  let row = tbody.querySelector('tr[data-symbol="' + q.symbol + '"]');
  if (!row) {
    tbody.insertAdjacentHTML('beforeend', renderRow(q));
    const rows = [...tbody.querySelectorAll('tr[data-symbol]')];
    rows.sort((a, b) => a.dataset.symbol.localeCompare(b.dataset.symbol));
    rows.forEach((tr) => tbody.appendChild(tr));
  } else {
    row.children[1].textContent = q.bid;
    row.children[2].textContent = q.ask;
    row.children[3].textContent = (q.ask - q.bid).toFixed(5);
    row.querySelector('.age').textContent = Math.max(0, Math.round((Date.now() - q.updatedAt) / 1000)) + 's前';
  }
  document.getElementById('count').textContent = quotes.size;
}

function setStatus(text, live) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = live ? 'status-live' : 'status-offline';
}

function connectStream() {
  const es = new EventSource('/quotes/stream');
  es.addEventListener('snapshot', (event) => {
    quotes.clear();
    JSON.parse(event.data).forEach((q) => quotes.set(q.symbol, q));
    renderTable();
  });
  es.addEventListener('quote', (event) => {
    upsertQuote(JSON.parse(event.data));
  });
  es.addEventListener('remove', (event) => {
    const { symbol } = JSON.parse(event.data);
    quotes.delete(symbol);
    document.querySelector('tr[data-symbol="' + symbol + '"]')?.remove();
    if (!quotes.size) renderTable();
    else document.getElementById('count').textContent = quotes.size;
  });
  es.onopen = () => setStatus('已连接', true);
  es.onerror = () => setStatus('重连中...', false);
  return es;
}

connectStream();
setInterval(() => {
  document.querySelectorAll('#rows .age').forEach((cell) => {
    const row = cell.closest('tr[data-symbol]');
    const q = quotes.get(row.dataset.symbol);
    if (!q) return;
    cell.textContent = Math.max(0, Math.round((Date.now() - q.updatedAt) / 1000)) + 's前';
  });
}, 1000);
</script>
</body></html>`;
}

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderDashboard());
      return;
    }

    const pathname = req.url?.split('?')[0] ?? '';
    if (handleSwaggerRoutes(req, res, pathname)) return;

    if (pathname.startsWith('/rpc/')) {
      if (!isTradeEnabled()) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'trade disabled', hint: 'set MT5_TRADE_ENABLED=1 on Windows gateway' }));
        return;
      }
      const handled = await handleTradingRoutes(req, res, pathname);
      if (handled) return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'GET' && req.url === '/health') {
      const payload = { ok: true, quotes: getActiveQuotes().length };
      if (isTradeEnabled()) {
        payload.trade = true;
      }
      res.writeHead(200);
      res.end(JSON.stringify(payload));
      return;
    }

    if (req.method === 'GET' && req.url === '/quotes') {
      res.writeHead(200);
      res.end(JSON.stringify(getActiveQuotes()));
      return;
    }

    if (req.method === 'GET' && req.url === '/quotes/stream') {
      handleSseStream(req, res);
      return;
    }

    const match = req.url?.match(/^\/quote\/([^/?]+)/);
    if (req.method === 'GET' && match) {
      const symbol = decodeURIComponent(match[1]).toUpperCase();
      const quote = quotes.get(symbol);
      if (!quote || !isQuoteFresh(quote)) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: `暂无 ${symbol} 行情，请运行 npm run auto 启动 Python 桥接` }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(quote));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.listen(HTTP_PORT, BIND_HOST, () => {
    console.log(`[mt5] HTTP API  http://${BIND_HOST}:${HTTP_PORT}`);
    console.log(`[mt5] Swagger     http://127.0.0.1:${HTTP_PORT}/docs`);
    console.log(`[mt5] OpenAPI     http://127.0.0.1:${HTTP_PORT}/openapi.json`);
    console.log(`[mt5] SSE 推送   http://127.0.0.1:${HTTP_PORT}/quotes/stream`);
    if (isTradeEnabled()) {
      console.log(`[mt5] 交易 RPC   http://127.0.0.1:${HTTP_PORT}/rpc/get_account_information`);
    }
    console.log(`[mt5] 浏览器查看 http://127.0.0.1:${HTTP_PORT}/`);
  }).on('error', (err) => {
    console.error(`[mt5] HTTP 启动失败 ${BIND_HOST}:${HTTP_PORT}`, err.message);
    process.exit(1);
  });

  return server;
}

export function getQuote(symbol) {
  const quote = quotes.get(symbol.toUpperCase()) ?? null;
  return quote && isQuoteFresh(quote) ? quote : null;
}

export function getAllQuotes() {
  return getActiveQuotes();
}

export function createQuoteStore() {
  return { getQuote, getAllQuotes, quotes };
}

export function startQuoteServer() {
  console.log('[mt5] starting quote server...');
  startTcpServer();
  startHttpServer();
}

function isMainModule() {
  const selfPath = fileURLToPath(import.meta.url);
  const entry = process.argv[1];
  if (!entry) return false;
  if (path.resolve(entry) === selfPath) return true;
  // PM2 fork 模式通过 ProcessContainerFork.js 加载脚本，argv[1] 不是入口文件
  return entry.includes('ProcessContainerFork');
}

if (isMainModule()) {
  console.log('[mt5] starting quote server...');
  startSseHeartbeat();
  startQuotePruner();
  startTcpServer();
  startHttpServer();
}
