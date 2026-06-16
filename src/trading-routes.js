const TRADE_ENABLED = !['0', 'false', 'no', 'off'].includes(
  String(process.env.MT5_TRADE_ENABLED ?? '0').toLowerCase(),
);
const TRADE_BASE_URL = process.env.MT5_TRADE_URL || 'http://127.0.0.1:9530';
const TRADE_TIMEOUT_MS = Number(process.env.MT5_TRADE_TIMEOUT_MS || 30_000);

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<any>}
 */
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: any }} [options]
 */
async function proxyTradeRequest(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRADE_TIMEOUT_MS);
  try {
    const init = {
      method: options.method || 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    };
    if (options.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${TRADE_BASE_URL}${path}`, init);
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text || `HTTP ${res.status}` };
    }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {any} data
 */
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} pathname
 * @returns {Promise<boolean>}
 */
export async function handleTradingRoutes(req, res, pathname) {
  if (!TRADE_ENABLED) {
    return false;
  }

  try {
    if (req.method === 'GET' && pathname === '/rpc/health') {
      const result = await proxyTradeRequest('/health');
      sendJson(res, result.status, result.data);
      return true;
    }

    if (req.method === 'POST' && pathname === '/rpc/create_market_buy_order') {
      const body = await readJsonBody(req);
      const result = await proxyTradeRequest('/rpc/create_market_buy_order', {
        method: 'POST',
        body,
      });
      sendJson(res, result.status, result.data);
      return true;
    }

    if (req.method === 'POST' && pathname === '/rpc/create_market_sell_order') {
      const body = await readJsonBody(req);
      const result = await proxyTradeRequest('/rpc/create_market_sell_order', {
        method: 'POST',
        body,
      });
      sendJson(res, result.status, result.data);
      return true;
    }

    if (req.method === 'POST' && pathname === '/rpc/close_position') {
      const body = await readJsonBody(req);
      const result = await proxyTradeRequest('/rpc/close_position', {
        method: 'POST',
        body: {
          positionId: body.positionId ?? body.position_id,
          comment: body.comment ?? '',
          clientId: body.clientId,
        },
      });
      sendJson(res, result.status, result.data);
      return true;
    }

    if (req.method === 'POST' && pathname === '/rpc/close_position_partially') {
      const body = await readJsonBody(req);
      const result = await proxyTradeRequest('/rpc/close_position_partially', {
        method: 'POST',
        body: {
          positionId: body.positionId ?? body.position_id,
          volume: body.volume,
          comment: body.comment ?? '',
          clientId: body.clientId,
        },
      });
      sendJson(res, result.status, result.data);
      return true;
    }

    if (req.method === 'GET' && pathname === '/rpc/get_positions') {
      const result = await proxyTradeRequest('/rpc/get_positions');
      sendJson(res, result.status, result.data);
      return true;
    }

    if (req.method === 'GET' && pathname === '/rpc/get_account_information') {
      const result = await proxyTradeRequest('/rpc/get_account_information');
      sendJson(res, result.status, result.data);
      return true;
    }

    const positionMatch = pathname.match(/^\/rpc\/get_position\/([^/]+)$/);
    if (req.method === 'GET' && positionMatch) {
      const positionId = decodeURIComponent(positionMatch[1]);
      const result = await proxyTradeRequest(`/rpc/get_position/${encodeURIComponent(positionId)}`);
      sendJson(res, result.status, result.data);
      return true;
    }

    const orderMatch = pathname.match(/^\/rpc\/get_order\/([^/]+)$/);
    if (req.method === 'GET' && orderMatch) {
      const orderId = decodeURIComponent(orderMatch[1]);
      const result = await proxyTradeRequest(`/rpc/get_order/${encodeURIComponent(orderId)}`);
      sendJson(res, result.status, result.data);
      return true;
    }

    if (req.method === 'GET' && pathname === '/rpc/get_history_orders_by_time_range') {
      const url = new URL(req.url ?? '', 'http://localhost');
      const query = url.search || '';
      const result = await proxyTradeRequest(`/rpc/get_history_orders_by_time_range${query}`);
      sendJson(res, result.status, result.data);
      return true;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 502, {
      error: 'trade proxy failed',
      message,
      tradeUrl: TRADE_BASE_URL,
    });
    return true;
  }

  return false;
}

export function isTradeEnabled() {
  return TRADE_ENABLED;
}

export function getTradeBaseUrl() {
  return TRADE_BASE_URL;
}
