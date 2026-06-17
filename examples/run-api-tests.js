const BASE = process.env.MT5_GATEWAY_BASE_URL || 'http://127.0.0.1:9628';
const TRADE = process.env.MT5_RUN_TRADE_TEST === '1';

/** @type {{ name: string, status: 'PASS'|'FAIL'|'SKIP', detail: string }[]} */
const report = [];

async function run(name, fn) {
  try {
    const detail = await fn();
    report.push({ name, status: 'PASS', detail: String(detail) });
  } catch (err) {
    report.push({ name, status: 'FAIL', detail: err instanceof Error ? err.message : String(err) });
  }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data)}`);
  return data;
}

await run('GET /health', async () => {
  const data = await get('/health');
  if (!data.ok) throw new Error(JSON.stringify(data));
  return JSON.stringify(data);
});

await run('GET /quotes', async () => {
  const data = await get('/quotes');
  if (!Array.isArray(data) || data.length === 0) throw new Error('empty quotes');
  return `count=${data.length} first=${data[0].symbol} bid=${data[0].bid}`;
});

await run('GET /quote/XAUUSD', async () => {
  const data = await get('/quote/XAUUSD');
  return `bid=${data.bid} ask=${data.ask}`;
});

await run('GET /rpc/get_account_information', async () => {
  const data = await get('/rpc/get_account_information');
  if (!data.login) throw new Error(JSON.stringify(data));
  return `login=${data.login} balance=${data.balance} tradeAllowed=${data.tradeAllowed}`;
});

await run('GET /rpc/get_positions', async () => {
  const data = await get('/rpc/get_positions');
  if (!Array.isArray(data)) throw new Error(JSON.stringify(data));
  return `count=${data.length}`;
});

await run('GET /rpc/get_history_orders_by_time_range', async () => {
  const q = new URLSearchParams({
    from: '2026-06-01T00:00:00Z',
    to: '2026-06-16T23:59:59Z',
  });
  const data = await get(`/rpc/get_history_orders_by_time_range?${q}`);
  if (!Array.isArray(data)) throw new Error(JSON.stringify(data));
  return `count=${data.length}`;
});

await run('GET /quotes/stream (SSE snapshot)', async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const res = await fetch(`${BASE}/quotes/stream`, { signal: controller.signal });
  clearTimeout(timer);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error('no body');
  const { value } = await reader.read();
  reader.cancel().catch(() => {});
  const chunk = new TextDecoder().decode(value);
  if (!chunk.includes('event: snapshot') && !chunk.includes('event: quote')) {
    throw new Error(`unexpected sse: ${chunk.slice(0, 120)}`);
  }
  return 'received SSE event';
});

let openedPositionId = '';
let openedOrderId = '';

if (TRADE) {
  await run('POST /rpc/create_market_buy_order', async () => {
    const data = await post('/rpc/create_market_buy_order', {
      symbol: 'XAUUSD',
      volume: 0.01,
      comment: `auto-test-${Date.now()}`,
    });
    if (data.status !== 'success') throw new Error(JSON.stringify(data));
    openedPositionId = String(data.positionId ?? data.position_id ?? '');
    openedOrderId = String(data.orderId ?? data.order_id ?? '');
    return `orderId=${openedOrderId} positionId=${openedPositionId}`;
  });

  await run('GET /rpc/get_position/:id', async () => {
    if (!openedPositionId) throw new Error('no position from buy test');
    const data = await get(`/rpc/get_position/${encodeURIComponent(openedPositionId)}`);
    return `symbol=${data.symbol} volume=${data.volume}`;
  });

  await run('GET /rpc/get_order/:id', async () => {
    if (!openedOrderId) throw new Error('no order from buy test');
    const data = await get(`/rpc/get_order/${encodeURIComponent(openedOrderId)}`);
    return `orderId=${data.orderId ?? data.id}`;
  });

  await run('POST /rpc/close_position', async () => {
    if (!openedPositionId) throw new Error('no position to close');
    const data = await post('/rpc/close_position', {
      positionId: openedPositionId,
      comment: 'auto-test-close',
    });
    return JSON.stringify(data);
  });
} else {
  report.push({ name: 'POST /rpc/create_market_buy_order', status: 'SKIP', detail: 'set MT5_RUN_TRADE_TEST=1 to run live demo trade' });
  report.push({ name: 'GET /rpc/get_position/:id', status: 'SKIP', detail: 'depends on trade test' });
  report.push({ name: 'GET /rpc/get_order/:id', status: 'SKIP', detail: 'depends on trade test' });
  report.push({ name: 'POST /rpc/close_position', status: 'SKIP', detail: 'depends on trade test' });
}

await run('GET http://127.0.0.1:9530/health (direct python)', async () => {
  const res = await fetch('http://127.0.0.1:9530/health');
  const data = await res.json();
  if (!data.ok) throw new Error(JSON.stringify(data));
  return JSON.stringify(data);
});

const pass = report.filter((r) => r.status === 'PASS').length;
const fail = report.filter((r) => r.status === 'FAIL').length;
const skip = report.filter((r) => r.status === 'SKIP').length;

console.log('\n=== MT5 API Test Report ===');
console.log(`Target: ${BASE}`);
console.log(`Time: ${new Date().toISOString()}`);
console.log(`Summary: PASS=${pass} FAIL=${fail} SKIP=${skip}\n`);
for (const row of report) {
  console.log(`[${row.status}] ${row.name}`);
  console.log(`       ${row.detail}\n`);
}
process.exit(fail > 0 ? 1 : 0);
