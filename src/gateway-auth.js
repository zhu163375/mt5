/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function checkGatewayAuth(req) {
  const whitelist = (process.env.MT5_GATEWAY_IP_WHITELIST ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (whitelist.length > 0) {
    const forwarded = req.headers['x-forwarded-for'];
    const remote = typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? '';
    const allowed = whitelist.some((item) => item === '*' || item === remote);
    if (!allowed) {
      return { ok: false, status: 403, error: 'IP not allowed' };
    }
  }

  const apiKey = process.env.MT5_GATEWAY_API_KEY?.trim();
  if (apiKey) {
    const authorization = String(req.headers.authorization ?? '');
    const headerKey = String(req.headers['x-api-key'] ?? '');
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (bearer !== apiKey && headerKey !== apiKey) {
      return { ok: false, status: 401, error: 'invalid or missing API key' };
    }
  }

  return { ok: true };
}
