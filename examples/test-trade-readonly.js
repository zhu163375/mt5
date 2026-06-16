const BASE = process.env.MT5_GATEWAY_BASE_URL || 'http://127.0.0.1:9528';

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  console.log(path, res.status, data);
}

await get('/health');
await get('/rpc/get_account_information');
await get('/rpc/get_positions');
