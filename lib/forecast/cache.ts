import type { ForecastResponse } from './types';

const TTL_MS = 10 * 60 * 1000; // 10 minutes

interface Entry {
  response: ForecastResponse;
  expiresAt: number;
}

const cache = new Map<string, Entry>();

function key(walletId: string, timeframe: string, locale: string): string {
  return `${walletId}:${timeframe}:${locale}`;
}

export function getCachedForecast(
  walletId: string,
  timeframe: string,
  locale: string
): ForecastResponse | null {
  const k = key(walletId, timeframe, locale);
  const hit = cache.get(k);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(k);
    return null;
  }
  return hit.response;
}

export function setCachedForecast(
  walletId: string,
  timeframe: string,
  locale: string,
  response: ForecastResponse
): void {
  cache.set(key(walletId, timeframe, locale), {
    response,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function invalidateForecastCache(walletId: string): void {
  const keysToDelete: string[] = [];
  cache.forEach((_, k) => {
    if (k.startsWith(walletId + ':')) keysToDelete.push(k);
  });
  for (const k of keysToDelete) cache.delete(k);
}
