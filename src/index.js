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
 * 订阅行情更新（轮询 HTTP API）
 * @param {string[]} symbols
 * @param {(quote: Quote) => void} onQuote
 * @param {{ intervalMs?: number, signal?: AbortSignal }} [options]
 */
export async function watchQuotes(symbols, onQuote, options = {}) {
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
