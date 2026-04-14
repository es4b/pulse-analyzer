import pool from '@/lib/db';

const GECKO_BASE = 'https://api.geckoterminal.com/api/v2';
const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex/tokens';

// 30 req/min = 2s between calls; 2.1s for safety
const RATE_LIMIT_DELAY_MS = 2100;
const PRICE_CACHE_TTL_SEC = 3600; // 1 hour

// WPLS / wrapped Pulse — used as the reference token for native PLS pricing
export const WPLS_ADDRESS = '0xa1077a294dde1b09bb078844df40758a5d0f9a27';

let lastGeckoRequest = 0;

async function geckoFetch(path: string): Promise<Response> {
  const elapsed = Date.now() - lastGeckoRequest;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS - elapsed));
  }
  lastGeckoRequest = Date.now();
  return fetch(`${GECKO_BASE}${path}`, { headers: { Accept: 'application/json' } });
}

/**
 * Get the best-liquidity pool address for a token. Cached in token_pools.
 */
export async function getTokenPools(address: string): Promise<string | null> {
  const lower = address.toLowerCase();

  const { rows } = await pool.query(
    'SELECT pool_address FROM token_pools WHERE token_address = $1',
    [lower]
  );
  if (rows.length > 0) return rows[0].pool_address;

  try {
    const res = await geckoFetch(`/networks/pulsechain/tokens/${lower}/pools?page=1`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as {
      data?: Array<{ attributes?: { address?: string } }>;
    };
    const poolAddress = data.data?.[0]?.attributes?.address;
    if (!poolAddress) return null;

    await pool.query(
      `INSERT INTO token_pools (token_address, pool_address, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (token_address) DO UPDATE
       SET pool_address = EXCLUDED.pool_address, updated_at = now()`,
      [lower, poolAddress]
    );
    return poolAddress;
  } catch (err) {
    console.error('[gecko getTokenPools]', lower, err);
    return null;
  }
}

async function savePrice(address: string, priceUsd: number): Promise<void> {
  await pool.query(
    `INSERT INTO token_prices (token_address, price_usd, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (token_address) DO UPDATE
     SET price_usd = EXCLUDED.price_usd, updated_at = now()`,
    [address, priceUsd]
  );
}

/**
 * Get current USD price for a token. Uses token_prices cache (1h TTL),
 * GeckoTerminal, then DexScreener as fallback.
 */
export async function getTokenPrice(address: string): Promise<number | null> {
  const lower = address.toLowerCase();

  // Cache hit (< 1 hour old)
  const { rows } = await pool.query(
    `SELECT price_usd FROM token_prices
     WHERE token_address = $1
       AND updated_at > now() - ($2 || ' seconds')::interval`,
    [lower, PRICE_CACHE_TTL_SEC]
  );
  if (rows.length > 0) return parseFloat(rows[0].price_usd);

  // Try GeckoTerminal
  try {
    const res = await geckoFetch(`/networks/pulsechain/tokens/${lower}`);
    if (res.ok) {
      const data = await res.json() as { data?: { attributes?: { price_usd?: string } } };
      const priceStr = data.data?.attributes?.price_usd;
      if (priceStr) {
        const price = parseFloat(priceStr);
        if (price > 0) {
          await savePrice(lower, price);
          return price;
        }
      }
    }
  } catch (err) {
    console.error('[gecko getTokenPrice]', lower, err);
  }

  // Fallback: DexScreener
  try {
    const res = await fetch(`${DEXSCREENER_BASE}/${lower}`);
    if (res.ok) {
      const data = await res.json() as {
        pairs?: Array<{ chainId: string; priceUsd?: string; liquidity?: { usd?: number } }>;
      };
      const pulsePairs = (data.pairs || []).filter((p) => p.chainId === 'pulsechain');
      // Pick the pair with highest liquidity
      pulsePairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
      const priceStr = pulsePairs[0]?.priceUsd;
      if (priceStr) {
        const price = parseFloat(priceStr);
        if (price > 0) {
          await savePrice(lower, price);
          console.log('[price fallback via DexScreener]', lower, price);
          return price;
        }
      }
    }
  } catch (err) {
    console.error('[dexscreener fallback]', lower, err);
  }

  return null;
}

export interface OhlcvCandle {
  timestamp: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch historical OHLCV candles for a pool.
 */
export async function getHistoricalPrices(
  poolAddress: string,
  timeframe: 'day' | 'hour' | 'minute' = 'day',
  limit: number = 1000
): Promise<OhlcvCandle[]> {
  try {
    const res = await geckoFetch(
      `/networks/pulsechain/pools/${poolAddress}/ohlcv/${timeframe}?limit=${limit}&currency=usd`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as {
      data?: { attributes?: { ohlcv_list?: number[][] } };
    };
    const list = data.data?.attributes?.ohlcv_list ?? [];
    return list.map((row) => ({
      timestamp: row[0],
      open: row[1],
      high: row[2],
      low: row[3],
      close: row[4],
      volume: row[5],
    }));
  } catch (err) {
    console.error('[gecko getHistoricalPrices]', poolAddress, err);
    return [];
  }
}

/**
 * Convenience: get historical PLS (WPLS) daily OHLCV.
 */
export async function getPlsHistoricalPrices(limit: number = 1000): Promise<OhlcvCandle[]> {
  const poolAddr = await getTokenPools(WPLS_ADDRESS);
  if (!poolAddr) return [];
  return getHistoricalPrices(poolAddr, 'day', limit);
}

/**
 * Bulk fetch prices for multiple tokens. Cache hits cost ~0ms, misses ~2s each.
 */
export async function getTokenPricesBulk(addresses: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  for (const addr of addresses) {
    const p = await getTokenPrice(addr);
    if (p !== null) prices.set(addr.toLowerCase(), p);
  }
  return prices;
}
