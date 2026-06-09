import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const BIND_HOST = process.env.MT5_BIND_HOST || '127.0.0.1';
const TCP_PORT = Number(process.env.MT5_TCP_PORT || 9527);
const HTTP_PORT = Number(process.env.MT5_HTTP_PORT || 9528);

/** @type {Map<string, { symbol: string, bid: number, ask: number, time: number, updatedAt: number }>} */
const quotes = new Map();

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
  });

  return server;
}

function renderDashboard() {
  const rows = [...quotes.values()]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((q) => {
      const age = Math.max(0, Math.round((Date.now() - q.updatedAt) / 1000));
      return `<tr><td>${q.symbol}</td><td>${q.bid}</td><td>${q.ask}</td><td>${(q.ask - q.bid).toFixed(5)}</td><td>${age}s前</td></tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>MT5 行情</title>
<style>
body{font-family:Segoe UI,sans-serif;margin:24px;background:#0f172a;color:#e2e8f0}
h1{margin:0 0 8px}p{color:#94a3b8}
table{border-collapse:collapse;width:100%;max-width:720px;margin-top:16px}
th,td{border:1px solid #334155;padding:10px;text-align:left}
th{background:#1e293b}.empty{color:#f87171}
</style></head><body>
<h1>MT5 实时行情</h1>
<p>自动更新 | 品种数: <span id="count">${quotes.size}</span> | API: <a href="/quotes" style="color:#38bdf8">/quotes</a></p>
<table><thead><tr><th>品种</th><th>Bid</th><th>Ask</th><th>Spread</th><th>更新</th></tr></thead>
<tbody id="rows">${rows || '<tr><td colspan="5" class="empty">暂无数据，请运行 npm run auto</td></tr>'}</tbody>
</table>
<script>
async function refresh() {
  try {
    const res = await fetch('/quotes');
    const list = await res.json();
    document.getElementById('count').textContent = list.length;
    const tbody = document.getElementById('rows');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无数据，请运行 npm run auto</td></tr>';
      return;
    }
    tbody.innerHTML = list.sort((a,b)=>a.symbol.localeCompare(b.symbol)).map(q => {
      const age = Math.max(0, Math.round((Date.now() - q.updatedAt) / 1000));
      const spread = (q.ask - q.bid).toFixed(5);
      return '<tr><td>' + q.symbol + '</td><td>' + q.bid + '</td><td>' + q.ask + '</td><td>' + spread + '</td><td>' + age + 's前</td></tr>';
    }).join('');
  } catch (e) {
    console.error(e);
  }
}
setInterval(refresh, 1000);
refresh();
</script>
</body></html>`;
}

function startHttpServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderDashboard());
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, quotes: quotes.size }));
      return;
    }

    if (req.method === 'GET' && req.url === '/quotes') {
      res.writeHead(200);
      res.end(JSON.stringify([...quotes.values()]));
      return;
    }

    const match = req.url?.match(/^\/quote\/([^/?]+)/);
    if (req.method === 'GET' && match) {
      const symbol = decodeURIComponent(match[1]).toUpperCase();
      const quote = quotes.get(symbol);
      if (!quote) {
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
    console.log(`[mt5] 浏览器查看 http://127.0.0.1:${HTTP_PORT}/`);
  });

  return server;
}

export function getQuote(symbol) {
  return quotes.get(symbol.toUpperCase()) ?? null;
}

export function getAllQuotes() {
  return [...quotes.values()];
}

export function createQuoteStore() {
  return { getQuote, getAllQuotes, quotes };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  startTcpServer();
  startHttpServer();
}
