import fs from 'node:fs';

/** @typedef {{ gateway: string, label: string, enabled: boolean }} AccountEntry */

export class RouterError extends Error {
  /** @param {string} message */
  /** @param {string} code */
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** @type {{ defaultAccountId: string | null, accounts: Map<string, AccountEntry>, loadedAt: number }} */
let state = {
  defaultAccountId: null,
  accounts: new Map(),
  loadedAt: 0,
};

function normalizeGateway(url) {
  return String(url).trim().replace(/\/+$/, '');
}

export function loadAccountMap() {
  const mapPath = process.env.MT5_ACCOUNT_MAP?.trim();
  if (!mapPath) {
    state = { defaultAccountId: null, accounts: new Map(), loadedAt: Date.now() };
    return state;
  }
  if (!fs.existsSync(mapPath)) {
    console.warn(`[router] account map not found: ${mapPath}`);
    state = { defaultAccountId: null, accounts: new Map(), loadedAt: Date.now() };
    return state;
  }

  /** @type {Record<string, unknown>} */
  const raw = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  /** @type {Map<string, AccountEntry>} */
  const accounts = new Map();
  const defaultAccountId = raw.default != null ? String(raw.default).trim() : null;

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'default') continue;
    if (typeof value === 'string') {
      accounts.set(key, {
        gateway: normalizeGateway(value),
        label: key,
        enabled: true,
      });
      continue;
    }
    if (value && typeof value === 'object' && 'gateway' in value) {
      /** @type {{ gateway: string, label?: string, enabled?: boolean }} */
      const entry = value;
      accounts.set(key, {
        gateway: normalizeGateway(entry.gateway),
        label: entry.label ?? key,
        enabled: entry.enabled !== false,
      });
    }
  }

  state = { defaultAccountId, accounts, loadedAt: Date.now() };
  console.log(`[router] loaded ${accounts.size} account(s) from ${mapPath}`);
  return state;
}

export function getAccountRouterState() {
  if (!state.loadedAt) {
    loadAccountMap();
  }
  return state;
}

export function reloadAccountMap() {
  return loadAccountMap();
}

/**
 * @param {string | null | undefined} accountId
 * @returns {{ accountId: string, gateway: string, label: string }}
 */
export function resolveAccountBackend(accountId) {
  const routerState = getAccountRouterState();
  const requireAccountId = !['0', 'false', 'no', 'off'].includes(
    String(process.env.MT5_REQUIRE_ACCOUNT_ID ?? '0').toLowerCase(),
  );

  const normalized = accountId?.trim() || null;
  const resolvedId = normalized || routerState.defaultAccountId;

  if (!resolvedId) {
    throw new RouterError(
      requireAccountId ? 'X-Account-Id header is required' : 'accountId is required',
      'ACCOUNT_REQUIRED',
    );
  }

  const entry = routerState.accounts.get(resolvedId);
  if (!entry) {
    throw new RouterError(`unknown accountId: ${resolvedId}`, 'ACCOUNT_UNKNOWN');
  }
  if (!entry.enabled) {
    throw new RouterError(`account disabled: ${resolvedId}`, 'ACCOUNT_DISABLED');
  }

  return {
    accountId: resolvedId,
    gateway: entry.gateway,
    label: entry.label,
  };
}

export function listConfiguredAccountIds() {
  return [...getAccountRouterState().accounts.keys()];
}

/**
 * @param {number} [timeoutMs]
 */
export async function probeBackends(timeoutMs = Number(process.env.MT5_BACKEND_PROBE_MS || 3000)) {
  /** @type {Record<string, { ok: boolean, gateway?: string, latencyMs?: number, trade?: boolean, error?: string }>} */
  const results = {};
  for (const [accountId, entry] of getAccountRouterState().accounts.entries()) {
    const startedAt = Date.now();
    if (!entry.enabled) {
      results[accountId] = { ok: false, gateway: entry.gateway, error: 'disabled' };
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${entry.gateway}/health`, { signal: controller.signal });
      /** @type {any} */
      let data = null;
      if (res.ok) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }
      results[accountId] = {
        ok: res.ok,
        gateway: entry.gateway,
        latencyMs: Date.now() - startedAt,
        trade: data?.trade,
      };
    } catch (err) {
      results[accountId] = {
        ok: false,
        gateway: entry.gateway,
        latencyMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return results;
}
