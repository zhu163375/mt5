import { watchQuotes } from '../src/index.js';

const symbols = (process.argv[2] || 'XAUUSD,XAGUSD').split(',').map((s) => s.trim());
const controller = new AbortController();

process.on('SIGINT', () => controller.abort());

console.log(`监听品种: ${symbols.join(', ')}（SSE 推送，Ctrl+C 退出）\n`);

try {
  await watchQuotes(
    symbols,
    (quote) => {
      const spread = ((quote.ask - quote.bid) * 100000).toFixed(1);
      console.log(
        `[${new Date(quote.updatedAt).toLocaleTimeString()}] ` +
        `${quote.symbol}  bid=${quote.bid}  ask=${quote.ask}  spread=${spread} pts`
      );
    },
    { signal: controller.signal, mode: 'sse' },
  );
} catch (err) {
  if (err.name !== 'AbortError') {
    console.error(err.message);
    process.exit(1);
  }
}
