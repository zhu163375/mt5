import {
  RouterError,
  resolveAccountBackend,
  probeBackends,
} from './account-router.js';

const TRADE_ENABLED = !['0', 'false', 'no', 'off'].includes(
  String(process.env.MT5_TRADE_ENABLED ?? '0').toLowerCase(),
);
const TRADE_BASE_URL = (process.env.MT5_TRADE_URL || 'http://127.0.0.1:9530').replace(/\/+$/, '');
const TRADE_TIMEOUT_MS = Number(process.env.MT5_TRADE_TIMEOUT_MS || 30_000);

/**
 * @returns {'off' | 'local' | 'router'}
 */
export function getTradeMode() {
  const configured = String(process.env.MT5_TRADE_MODE ?? '').toLowerCase();
  if (configured === 'router' || configured === 'local' || configured === 'off') {
    return configured;
  }
  return TRADE_ENABLED ? 'local' : 'off';
}

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
 * @param {import('node:http').IncomingMessage} req
 * @param {any} [body]
 * @returns {string | null}
 */
function extractAccountId(req, body) {
  const header = req.headers['x-account-id'] ?? req.headers['x-mt-account-id'];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('accountId');
  if (fromQuery?.trim()) {
    return fromQuery.trim();
  }
  if (body?.accountId != null && String(body.accountId).trim()) {
    return String(body.accountId).trim();
  }
  return null;
}

/**
 * @param {string | null} accountId
 * @returns {{ accountId: string, gateway: string, mode: 'local' | 'router' }}
 */
function resolveBackend(accountId) {
  const mode = getTradeMode();
  if (mode === 'router') {
    const resolved = resolveAccountBackend(accountId);
    return { ...resolved, mode: 'router' };
  }
  return {
    accountId: accountId?.trim() || 'local',
    gateway: TRADE_BASE_URL,
    mode: 'local',
  };
}

/**
 * @param {string} backendBaseUrl
 * @param {string} path
 * @param {{ method?: string, body?: any, accountId?: string }} [options]
 */
async function proxyTradeRequest(backendBaseUrl, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRADE_TIMEOUT_MS);
  const url = `${backendBaseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    /** @type {Record<string, string>} */
    const headers = { Accept: 'application/json' };
    if (options.accountId) {
      headers['X-Account-Id'] = options.accountId;
    }
    /** @type {RequestInit} */
    const init = {
      method: options.method || 'GET',
      headers,
      signal: controller.signal,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, init);
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text || `HTTP ${res.status}` };
    }
    return { status: res.status, data, backendUrl: backendBaseUrl };
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
 * @param {string | null} accountId
 * @param {{ accountId: string, gateway: string, mode: 'local' | 'router' }} backend
 * @param {any} [body]
 * @returns {Promise<boolean>}
 */
async function dispatchTradeRoute(req, res, pathname, accountId, backend, body) {
  const proxyOptions = { accountId: backend.accountId };

  if (req.method === 'GET' && pathname === '/rpc/health') {
    const healthPath = backend.mode === 'router' ? '/rpc/health' : '/health';
    const result = await proxyTradeRequest(backend.gateway, healthPath, proxyOptions);
    sendJson(res, result.status, result.data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/rpc/create_market_buy_order') {
    const payload = body ?? await readJsonBody(req);
    const result = await proxyTradeRequest(backend.gateway, '/rpc/create_market_buy_order', {
      method: 'POST',
      body: stripAccountId(payload),
      accountId: backend.accountId,
    });
    sendJson(res, result.status, result.data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/rpc/create_market_sell_order') {
    const payload = body ?? await readJsonBody(req);
    const result = await proxyTradeRequest(backend.gateway, '/rpc/create_market_sell_order', {
      method: 'POST',
      body: stripAccountId(payload),
      accountId: backend.accountId,
    });
    sendJson(res, result.status, result.data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/rpc/close_position') {
    const payload = body ?? await readJsonBody(req);
    const result = await proxyTradeRequest(backend.gateway, '/rpc/close_position', {
      method: 'POST',
      body: {
        positionId: payload.positionId ?? payload.position_id,
        comment: payload.comment ?? '',
        clientId: payload.clientId,
      },
      accountId: backend.accountId,
    });
    sendJson(res, result.status, result.data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/rpc/close_position_partially') {
    const payload = body ?? await readJsonBody(req);
    const result = await proxyTradeRequest(backend.gateway, '/rpc/close_position_partially', {
      method: 'POST',
      body: {
        positionId: payload.positionId ?? payload.position_id,
        volume: payload.volume,
        comment: payload.comment ?? '',
        clientId: payload.clientId,
      },
      accountId: backend.accountId,
    });
    sendJson(res, result.status, result.data);
    return true;
  }

  if (req.method === 'GET' && pathname === '/rpc/get_positions') {
    const result = await proxyTradeRequest(backend.gateway, '/rpc/get_positions', proxyOptions);
    sendJson(res, result.status, result.data);
    return true;
  }

  if (req.method === 'GET' && pathname === '/rpc/get_account_information') {
    const result = await proxyTradeRequest(
      backend.gateway,
      '/rpc/get_account_information',
      proxyOptions,
    );
    sendJson(res, result.status, result.data);
    return true;
  }

  const positionMatch = pathname.match(/^\/rpc\/get_position\/([^/]+)$/);
  if (req.method === 'GET' && positionMatch) {
    const positionId = decodeURIComponent(positionMatch[1]);
    const result = await proxyTradeRequest(
      backend.gateway,
      `/rpc/get_position/${encodeURIComponent(positionId)}`,
      proxyOptions,
    );
    sendJson(res, result.status, result.data);
    return true;
  }

  const orderMatch = pathname.match(/^\/rpc\/get_order\/([^/]+)$/);
  if (req.method === 'GET' && orderMatch) {
    const orderId = decodeURIComponent(orderMatch[1]);
    const result = await proxyTradeRequest(
      backend.gateway,
      `/rpc/get_order/${encodeURIComponent(orderId)}`,
      proxyOptions,
    );
    sendJson(res, result.status, result.data);
    return true;
  }

  if (req.method === 'GET' && pathname === '/rpc/get_history_orders_by_time_range') {
    const url = new URL(req.url ?? '', 'http://localhost');
    const query = url.search || '';
    const result = await proxyTradeRequest(
      backend.gateway,
      `/rpc/get_history_orders_by_time_range${query}`,
      proxyOptions,
    );
    sendJson(res, result.status, result.data);
    return true;
  }

  return false;
}

/**
 * @param {any} body
 */
function stripAccountId(body) {
  if (!body || typeof body !== 'object') return body;
  const { accountId, ...rest } = body;
  return rest;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} pathname
 * @returns {Promise<boolean>}
 */
export async function handleTradingRoutes(req, res, pathname) {
  if (getTradeMode() === 'off') {
    return false;
  }

  try {
    /** @type {any} */
    let body = null;
    if (req.method === 'POST') {
      body = await readJsonBody(req);
    }
    const accountId = extractAccountId(req, body);
    const backend = resolveBackend(accountId);

    if (backend.mode === 'router') {
      console.log(
        `[router] ${req.method} ${pathname} accountId=${backend.accountId} -> ${backend.gateway}`,
      );
    }

    return await dispatchTradeRoute(req, res, pathname, accountId, backend, body);
  } catch (err) {
    if (err instanceof RouterError) {
      const status = err.code === 'ACCOUNT_REQUIRED' ? 400 : 404;
      sendJson(res, status, { error: err.message, code: err.code });
      return true;
    }
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 502, {
      error: 'trade proxy failed',
      message,
      mode: getTradeMode(),
    });
    return true;
  }
}

export function isTradeEnabled() {
  return getTradeMode() !== 'off';
}

export function getTradeBaseUrl() {
  return getTradeMode() === 'router' ? 'router' : TRADE_BASE_URL;
}

export async function buildTradeHealthPayload() {
  const mode = getTradeMode();
  if (mode === 'off') {
    return { trade: false };
  }
  /** @type {Record<string, unknown>} */
  const payload = { trade: true, mode };
  if (mode === 'router') {
    payload.backends = await probeBackends();
  } else {
    payload.tradeUrl = TRADE_BASE_URL;
  }
  return payload;
}
