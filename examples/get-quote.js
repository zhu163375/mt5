import { fetchQuote } from '../src/index.js';

const symbol = process.argv[2] || 'XAGUSD';

try {
  const quote = await fetchQuote(symbol);
  console.log(JSON.stringify(quote, null, 2));
} catch (err) {
  console.error('获取行情失败:', err.message);
  console.error('请确认: 1) npm start 已运行  2) MT5 中 QuotePusher EA 已挂载');
  process.exit(1);
}
