const HTTP_BASE = process.env.MT5_HTTP_BASE || 'http://127.0.0.1:9528';

/**
 * @typedef {Object} Quote
 * @property {string} symbol
 * @property {number} bid
 * @property {number} ask
 * @property {number} time
 * @property {number} updatedAt
 */

/**
 * @param {string} symbol
 * @returns {Promise<Quote>}
 */
export async function fetchQuote(symbol) {
  const url = `${HTTP_BASE}/quote/${encodeURIComponent(symbol)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `请求失败: ${res.status}`);
  }
  return data;
}

/**
 * @returns {Promise<Quote[]>}
 */
export async function fetchAllQuotes() {
  const res = await fetch(`${HTTP_BASE}/quotes`);
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  return res.json();
}

/**
 * 订阅行情更新（SSE 长连接，行情变化时推送）
 * @param {(quote: Quote) => void} onQuote
 * @param {{ symbols?: string[], signal?: AbortSignal, reconnectMs?: number }} [options]
 */
export async function watchQuotesStream(onQuote, options = {}) {
  const filter = options.symbols
    ? new Set(options.symbols.map((symbol) => symbol.toUpperCase()))
    : null;
  const url = `${HTTP_BASE}/quotes/stream`;

  while (!options.signal?.aborted) {
    try {
      const res = await fetch(url, { signal: options.signal });
      if (!res.ok) throw new Error(`SSE 连接失败: ${res.status}`);
      if (!res.body) throw new Error('SSE 响应无 body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!options.signal?.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        buffer = consumeSseBuffer(buffer, (event, data) => {
          if (event === 'snapshot') {
            for (const quote of data) {
              if (!filter || filter.has(quote.symbol)) onQuote(quote);
            }
            return;
          }
          if (event === 'quote' && (!filter || filter.has(data.symbol))) {
            onQuote(data);
          }
        });
      }
    } catch (err) {
      if (options.signal?.aborted) break;
      console.error('[watch] SSE 断开，重连中...', err.message);
      await sleep(options.reconnectMs ?? 3000, options.signal);
    }
  }
}

/**
 * @param {string} buffer
 * @param {(event: string, data: any) => void} onEvent
 * @returns {string}
 */
function consumeSseBuffer(buffer, onEvent) {
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';

  for (const block of blocks) {
    if (!block.trim() || block.startsWith(':')) continue;

    let event = 'message';
    let dataLine = '';

    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) dataLine += line.slice(5).trim();
    }

    if (!dataLine) continue;
    onEvent(event, JSON.parse(dataLine));
  }

  return rest;
}

/**
 * 订阅行情更新（轮询 HTTP API，兼容旧用法）
 * @param {string[]} symbols
 * @param {(quote: Quote) => void} onQuote
 * @param {{ intervalMs?: number, signal?: AbortSignal, mode?: 'poll' | 'sse' }} [options]
 */
export async function watchQuotes(symbols, onQuote, options = {}) {
  if (options.mode !== 'poll') {
    return watchQuotesStream(onQuote, { ...options, symbols });
  }

  const intervalMs = options.intervalMs ?? 500;
  const seen = new Map();

  while (!options.signal?.aborted) {
    for (const symbol of symbols) {
      try {
        const quote = await fetchQuote(symbol);
        const prev = seen.get(symbol);
        if (!prev || prev.bid !== quote.bid || prev.ask !== quote.ask) {
          seen.set(symbol, quote);
          onQuote(quote);
        }
      } catch (err) {
        if (options.signal?.aborted) break;
        console.error(`[watch] ${symbol}:`, err.message);
      }
    }
    await sleep(intervalMs, options.signal);
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
