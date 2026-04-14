import type { Transaction } from '@/lib/types';
import type { OhlcvCandle } from '@/lib/prices/gecko';
import type {
  ScenarioResult,
  ScenarioOutcome,
  TimeDistribution,
  CurrentState,
  Baselines,
  MarketPhase,
  WalletPhase,
  TxSizeBucket,
  TimeOfDay,
  ScenarioContext,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LAMBDA = 0.1;
const SIZE_WEIGHT_CAP = 3.0;
const HOUR = 3600;
const DAY = 86400;
const BAYES_ALPHA = 1;
const BAYES_BETA = 1;
const SCENARIO_TX_WINDOW = 200; // Last N txs used for scenario detection (task #11)
const CONTEXT_MIN_SAMPLES = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Math helpers
// ─────────────────────────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)));
  return sorted[idx];
}

/** Trimmed mean: drops top & bottom 10% of values (task #5). */
function trimmedMean(xs: number[], trimPct = 0.1): number {
  if (xs.length === 0) return 0;
  if (xs.length < 5) return mean(xs);
  const sorted = [...xs].sort((a, b) => a - b);
  const trim = Math.floor(xs.length * trimPct);
  return mean(sorted.slice(trim, xs.length - trim));
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length;
}

function stdDev(xs: number[]): number {
  return Math.sqrt(variance(xs));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Bayesian smoothed probability with alpha=1, beta=1 (task #1). */
function bayesianProb(successes: number, trials: number): number {
  return (successes + BAYES_ALPHA) / (trials + BAYES_ALPHA + BAYES_BETA);
}

/** Shannon entropy of a probability distribution, normalized to [0,1] (task #4). */
function normalizedEntropy(probs: number[]): number {
  const n = probs.length;
  if (n <= 1) return 0;
  let h = 0;
  for (const p of probs) {
    if (p > 0) h -= p * Math.log2(p);
  }
  const maxH = Math.log2(n);
  return maxH > 0 ? h / maxH : 0;
}

function txPls(tx: Transaction): number {
  return parseInt(tx.value || '0') / 1e18;
}
function txTs(tx: Transaction): number {
  return parseInt(tx.timeStamp);
}
function isContract(tx: Transaction): boolean {
  return Boolean(tx.input && tx.input !== '0x');
}

// ─────────────────────────────────────────────────────────────────────────────
// Public weight helpers (preserved API)
// ─────────────────────────────────────────────────────────────────────────────

export function computeRecencyWeight(daysAgo: number): number {
  return Math.exp(-LAMBDA * Math.max(0, daysAgo));
}

export function computeSizeWeight(txSizePls: number, medianTxSizePls: number): number {
  if (medianTxSizePls <= 0) return 1;
  const w = Math.log(1 + txSizePls) / Math.log(1 + medianTxSizePls);
  return clamp(w, 0, SIZE_WEIGHT_CAP);
}

export function computeSimilarityScore(
  a: Pick<ScenarioContext, 'marketPhase' | 'walletPhase' | 'txSizeBucket'>,
  b: Pick<ScenarioContext, 'marketPhase' | 'walletPhase' | 'txSizeBucket'>
): number {
  let matches = 0;
  if (a.marketPhase === b.marketPhase) matches++;
  if (a.walletPhase === b.walletPhase) matches++;
  if (a.txSizeBucket === b.txSizeBucket) matches++;
  return matches / 3;
}

function bucketTxSize(pls: number, medianPls: number): TxSizeBucket {
  if (medianPls <= 0) return 'small';
  if (pls > medianPls * 3) return 'large';
  if (pls > medianPls) return 'medium';
  return 'small';
}

function timeOfDayFromHour(h: number): TimeOfDay {
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
}

function dayOfWeekName(d: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d];
}

function buildPlsPriceMap(ohlcv: OhlcvCandle[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of ohlcv) m.set(Math.floor(c.timestamp / DAY), c.close);
  return m;
}

function priceAt(ts: number, priceMap: Map<number, number>, fallback: number): number {
  if (priceMap.size === 0) return fallback;
  const day = Math.floor(ts / DAY);
  if (priceMap.has(day)) return priceMap.get(day)!;
  let best = fallback;
  let bestDiff = Infinity;
  const entries = Array.from(priceMap.entries());
  for (let i = 0; i < entries.length; i++) {
    const diff = Math.abs(entries[i][0] - day);
    if (diff < bestDiff) {
      best = entries[i][1];
      bestDiff = diff;
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action classification
// ─────────────────────────────────────────────────────────────────────────────

function classifyAction(tx: Transaction, me: string, medianPls: number): string {
  const val = txPls(tx);
  const isIn = tx.to?.toLowerCase() === me;
  const isOut = tx.from?.toLowerCase() === me;
  const contract = isContract(tx);
  if (contract && val === 0) return 'dex_contract_call';
  if (contract && val > 0) return 'token_purchase';
  if (isOut && val > medianPls * 3) return 'large_outgoing_transfer';
  if (isIn && val > medianPls * 3) return 'large_incoming_transfer';
  if (isOut || isIn) return 'wallet_to_wallet_transfer';
  return 'contract_interaction';
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-tx phase detection (for context baselines — task #2)
// ─────────────────────────────────────────────────────────────────────────────

function walletPhaseAt(tsSeconds: number, sortedTs: number[]): WalletPhase {
  const window = 7 * DAY;
  let count = 0;
  for (const t of sortedTs) {
    if (t >= tsSeconds - window && t <= tsSeconds + window) count++;
  }
  if (count > 10) return 'high_activity'; // doubled since window is ±7d
  if (count > 0) return 'low_activity';
  return 'dormant';
}

function marketPhaseAt(tsSeconds: number, priceMap: Map<number, number>): MarketPhase {
  if (priceMap.size < 2) return 'neutral';
  const priceNow = priceAt(tsSeconds, priceMap, 0);
  const priceAgo = priceAt(tsSeconds - 7 * DAY, priceMap, 0);
  if (priceAgo <= 0 || priceNow <= 0) return 'neutral';
  const change = (priceNow - priceAgo) / priceAgo;
  if (change > 0.15) return 'bull';
  if (change < -0.15) return 'bear';
  return 'neutral';
}

// ─────────────────────────────────────────────────────────────────────────────
// Baselines (global + context-stratified) — task #2
// ─────────────────────────────────────────────────────────────────────────────

export interface BaselinesWithContext extends Baselines {
  byContext: Record<string, { counts: Partial<Record<keyof Baselines, number>>; total: number }>;
}

function ctxKey(walletPhase: WalletPhase, marketPhase: MarketPhase): string {
  return `${walletPhase}:${marketPhase}`;
}

export function computeBaselines(
  txs: Transaction[],
  walletAddress: string,
  ohlcv: OhlcvCandle[] = []
): BaselinesWithContext {
  const me = walletAddress.toLowerCase();
  const nonZero = txs.filter((t) => txPls(t) > 0);
  const medianPls = median(nonZero.map(txPls));
  const priceMap = buildPlsPriceMap(ohlcv);

  const global: Record<keyof Baselines, number> = {
    large_incoming_transfer: 0,
    large_outgoing_transfer: 0,
    dex_contract_call: 0,
    token_purchase: 0,
    inactivity_period: 0,
    contract_interaction: 0,
    wallet_to_wallet_transfer: 0,
  };
  const byContext: Record<string, { counts: Partial<Record<keyof Baselines, number>>; total: number }> = {};
  const sortedTs = [...txs].map(txTs).sort((a, b) => a - b);

  for (const tx of txs) {
    const action = classifyAction(tx, me, medianPls);
    if (action in global) global[action as keyof Baselines]++;

    const wp = walletPhaseAt(txTs(tx), sortedTs);
    const mp = marketPhaseAt(txTs(tx), priceMap);
    const k = ctxKey(wp, mp);
    if (!byContext[k]) byContext[k] = { counts: {}, total: 0 };
    byContext[k].counts[action as keyof Baselines] =
      (byContext[k].counts[action as keyof Baselines] ?? 0) + 1;
    byContext[k].total++;
  }

  const total = txs.length || 1;
  // Bayesian smoothing for global baselines (task #1)
  const smoothedGlobal: Record<keyof Baselines, number> = {
    large_incoming_transfer: bayesianProb(global.large_incoming_transfer, total),
    large_outgoing_transfer: bayesianProb(global.large_outgoing_transfer, total),
    dex_contract_call: bayesianProb(global.dex_contract_call, total),
    token_purchase: bayesianProb(global.token_purchase, total),
    inactivity_period: 0, // overridden below
    contract_interaction: bayesianProb(global.contract_interaction, total),
    wallet_to_wallet_transfer: bayesianProb(global.wallet_to_wallet_transfer, total),
  };

  // Inactivity baseline: fraction of ≥1-week gaps across tx intervals
  let gaps = 0;
  let totalWeeks = 0;
  for (let i = 1; i < sortedTs.length; i++) {
    const gap = sortedTs[i] - sortedTs[i - 1];
    const weeks = gap / (7 * DAY);
    totalWeeks += Math.max(1, Math.ceil(weeks));
    if (weeks > 1) gaps++;
  }
  smoothedGlobal.inactivity_period = bayesianProb(gaps, Math.max(1, totalWeeks));

  return { ...smoothedGlobal, byContext };
}

/** Resolve baseline for action given current context, falling back to global (task #2). */
function resolveBaseline(
  action: string,
  ctx: ScenarioContext,
  baselines: BaselinesWithContext
): number {
  const k = ctxKey(ctx.walletPhase, ctx.marketPhase);
  const entry = baselines.byContext[k];
  if (entry && entry.total >= CONTEXT_MIN_SAMPLES) {
    const count = entry.counts[action as keyof Baselines] ?? 0;
    return bayesianProb(count, entry.total);
  }
  return (baselines as unknown as Record<string, number>)[action] ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public phase detection (exported API)
// ─────────────────────────────────────────────────────────────────────────────

export function detectWalletPhase(txs: Transaction[]): WalletPhase {
  const now = Date.now() / 1000;
  const sevenDaysAgo = now - 7 * DAY;
  const recent = txs.filter((t) => txTs(t) >= sevenDaysAgo).length;
  if (recent > 5) return 'high_activity';
  if (recent > 0) return 'low_activity';
  return 'dormant';
}

export function detectMarketPhase(ohlcv: OhlcvCandle[]): MarketPhase {
  if (ohlcv.length < 7) return 'neutral';
  const latest = ohlcv[0].close;
  const weekAgo = ohlcv[Math.min(6, ohlcv.length - 1)].close;
  if (weekAgo <= 0) return 'neutral';
  const change = (latest - weekAgo) / weekAgo;
  if (change > 0.15) return 'bull';
  if (change < -0.15) return 'bear';
  return 'neutral';
}

function currentContext(
  txs: Transaction[],
  ohlcv: OhlcvCandle[]
): ScenarioContext {
  const now = new Date();
  const nonZero = txs.filter((t) => txPls(t) > 0);
  const medianPls = median(nonZero.map(txPls));
  const sorted = [...txs].sort((a, b) => txTs(b) - txTs(a));
  const lastTx = sorted[0];
  const lastVal = lastTx ? txPls(lastTx) : 0;
  return {
    marketPhase: detectMarketPhase(ohlcv),
    walletPhase: detectWalletPhase(txs),
    txSizeBucket: bucketTxSize(lastVal, medianPls),
    timeOfDay: timeOfDayFromHour(now.getUTCHours()),
    dayOfWeek: dayOfWeekName(now.getUTCDay()),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic follow-up analyzer (with normalized weights — task #3)
// ─────────────────────────────────────────────────────────────────────────────

interface FollowupBucket {
  weight: number;
  count: number;
  sizes: number[];
  destinations: string[];
  times: number[];
}

function aggregateFollowups(
  txs: Transaction[],
  walletAddress: string,
  triggerTimes: number[],
  windowSeconds: number,
  classifier: (tx: Transaction | null) => string,
  medianPls: number
): { buckets: Record<string, FollowupBucket>; samples: number } {
  const me = walletAddress.toLowerCase();
  const sorted = [...txs].sort((a, b) => txTs(a) - txTs(b));
  const nowSeconds = Date.now() / 1000;

  // First pass: compute all event weights
  interface Event {
    action: string;
    rawWeight: number;
    size: number;
    destination: string;
    timeHours: number;
  }
  const events: Event[] = [];
  for (const t0 of triggerTimes) {
    let nextTx: Transaction | null = null;
    for (const tx of sorted) {
      const ts = txTs(tx);
      if (ts > t0 && ts <= t0 + windowSeconds) {
        nextTx = tx;
        break;
      }
    }
    const action = classifier(nextTx);
    const daysAgo = (nowSeconds - t0) / DAY;
    const recency = computeRecencyWeight(daysAgo);
    const sizePls = nextTx ? txPls(nextTx) : 0;
    const sz = computeSizeWeight(sizePls, medianPls);
    events.push({
      action,
      rawWeight: recency * sz,
      size: sizePls,
      destination: nextTx?.to?.toLowerCase() ?? '',
      timeHours: nextTx ? (txTs(nextTx) - t0) / HOUR : windowSeconds / HOUR,
    });
  }

  // Normalize event weights so they sum to 1 (task #3)
  const totalRaw = events.reduce((s, e) => s + e.rawWeight, 0) || 1;

  const buckets: Record<string, FollowupBucket> = {};
  for (const e of events) {
    const normWeight = e.rawWeight / totalRaw;
    if (!buckets[e.action]) {
      buckets[e.action] = { weight: 0, count: 0, sizes: [], destinations: [], times: [] };
    }
    buckets[e.action].weight += normWeight;
    buckets[e.action].count++;
    buckets[e.action].sizes.push(e.size);
    if (e.destination && e.destination !== me) buckets[e.action].destinations.push(e.destination);
    buckets[e.action].times.push(e.timeHours);
  }

  return { buckets, samples: events.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Outcome construction (smoothing + trimmed time + edge significance)
// ─────────────────────────────────────────────────────────────────────────────

function bucketsToOutcomes(
  buckets: Record<string, FollowupBucket>,
  expectedActions: string[],
  baselines: BaselinesWithContext,
  ctx: ScenarioContext,
  sampleSize: number,
  negativeActions: string[] = []
): ScenarioOutcome[] {
  // Total weight after event-level normalization ≈ 1, but recompute for safety
  const totalWeight = Object.values(buckets).reduce((s, b) => s + b.weight, 0) || 1;

  const outcomes: ScenarioOutcome[] = [];
  for (const action of expectedActions) {
    const b = buckets[action];
    const rawCount = b?.count ?? 0;
    // Apply Bayesian smoothing (task #1): treat weighted proportion as counts
    const probability = bayesianProb(rawCount, sampleSize);
    const baseline = resolveBaseline(action, ctx, baselines);

    // Edge significance (task #8)
    let edge = probability - baseline;
    if (sampleSize < 5) edge = 0;
    else if (sampleSize < 10) edge *= 0.5;

    const times = b?.times ?? [];
    const dist = computeTimeDistribution(times);

    const destCounts: Record<string, number> = {};
    for (const d of b?.destinations ?? []) destCounts[d] = (destCounts[d] || 0) + 1;
    const commonDestinations = Object.entries(destCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d]) => d);

    outcomes.push({
      action,
      probability: Math.round(probability * 1000) / 1000,
      baselineProbability: Math.round(baseline * 1000) / 1000,
      edge: Math.round(edge * 1000) / 1000,
      // Trimmed mean for time-to-event (task #5)
      avgTimeToEventHours: Math.round(trimmedMean(times) * 10) / 10,
      medianTimeHours: Math.round(median(times) * 10) / 10,
      timeDistribution: dist,
      detail: {
        description: describeAction(action),
        avgSizePls: Math.round(trimmedMean(b?.sizes ?? []) * 100) / 100,
        commonDestinations,
      },
      isNegative: negativeActions.includes(action),
    });
  }
  return outcomes.sort((a, b) => b.probability - a.probability);
}

function computeTimeDistribution(hours: number[]): TimeDistribution {
  if (hours.length === 0) return { lessThan1h: 0, h1to6: 0, h6to24: 0, d1to7: 0, moreThan7d: 0 };
  const b = { lessThan1h: 0, h1to6: 0, h6to24: 0, d1to7: 0, moreThan7d: 0 };
  for (const h of hours) {
    if (h < 1) b.lessThan1h++;
    else if (h < 6) b.h1to6++;
    else if (h < 24) b.h6to24++;
    else if (h < 24 * 7) b.d1to7++;
    else b.moreThan7d++;
  }
  const n = hours.length;
  return {
    lessThan1h: Math.round((b.lessThan1h / n) * 100) / 100,
    h1to6: Math.round((b.h1to6 / n) * 100) / 100,
    h6to24: Math.round((b.h6to24 / n) * 100) / 100,
    d1to7: Math.round((b.d1to7 / n) * 100) / 100,
    moreThan7d: Math.round((b.moreThan7d / n) * 100) / 100,
  };
}

function describeAction(action: string): string {
  const table: Record<string, string> = {
    large_incoming_transfer: 'Receive large transfer',
    large_outgoing_transfer: 'Send large transfer',
    dex_contract_call: 'Interact with DEX contract',
    token_purchase: 'Buy tokens',
    wallet_to_wallet_transfer: 'Transfer to another wallet',
    contract_interaction: 'Interact with a contract',
    inactivity_period: 'Remain inactive',
    sent_to_dex: 'Send to DEX/contract',
    sent_to_wallet: 'Send to another wallet',
    bought_tokens: 'Buy tokens',
    stayed_inactive: 'Remain inactive',
    sent_back: 'Send back to source',
    bought_more_fomo: 'Buy more (FOMO)',
    sold_profit: 'Sell for profit',
    did_nothing: 'Take no action',
    moved_to_stablecoin: 'Move to stablecoin',
    large_transaction: 'Make a large transaction',
    small_transaction: 'Make a small transaction',
    continued_inactivity: 'Remain inactive',
    revenge_large_trade: 'Place a revenge trade (larger)',
    cautious_small_trade: 'Place a cautious smaller trade',
    complete_inactivity: 'Stop all activity',
    normal_trade: 'Place a normal-sized trade',
    another_contract_call: 'Make another contract call',
    withdrawal_to_wallet: 'Withdraw to wallet',
    active_in_next_hour: 'Be active in the next hour',
    active_today: 'Be active today',
    active_this_week: 'Be active this week',
    inactive: 'Stay inactive',
  };
  return table[action] ?? action;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence (with entropy penalty — task #4)
// ─────────────────────────────────────────────────────────────────────────────

function computeConfidence(
  sampleSize: number,
  outcomes: ScenarioOutcome[],
  recencyFactor: number,
  contradictionRate: number
): { baseConfidence: number; confidence: number; reliabilityFactor: number } {
  const reliabilityFactor = Math.min(sampleSize / 5, 1);
  const probs = outcomes.map((o) => o.probability);
  const outcomeVariance = probs.length ? Math.min(1, variance(probs) * 4) : 0;
  const baseConfidence =
    Math.min(sampleSize / 20, 1) * 0.4 +
    (1 - outcomeVariance) * 0.3 +
    recencyFactor * 0.2 +
    (1 - contradictionRate) * 0.1;
  // Entropy penalty (task #4)
  const ent = normalizedEntropy(probs);
  const entropyMultiplier = 1 - ent * 0.5;
  const confidence = baseConfidence * reliabilityFactor * entropyMultiplier * 100;
  return {
    baseConfidence: Math.round(baseConfidence * 100),
    confidence: Math.round(confidence),
    reliabilityFactor: Math.round(reliabilityFactor * 100) / 100,
  };
}

function decayForScenario(
  id: string,
  confidence: number
): { h1: number; h24: number; h48: number; d7: number } {
  const impulsive = new Set(['after_loss', 'after_price_pump', 'after_contract_interaction']);
  const timePattern = id === 'time_pattern';
  const h1 = Math.round(confidence * (impulsive.has(id) ? 0.95 : 0.6));
  const h24 = Math.round(confidence * 0.75);
  const h48 = Math.round(confidence * 0.55);
  const d7 = Math.round(confidence * (timePattern ? 0.7 : 0.3));
  return { h1, h24, h48, d7 };
}

function buildSequenceChain(
  txs: Transaction[],
  triggerTimes: number[],
  me: string,
  medianPls: number
): string[] {
  const sorted = [...txs].sort((a, b) => txTs(a) - txTs(b));
  const chainCounts: Record<string, number> = {};
  for (const t0 of triggerTimes) {
    const nextThree: string[] = [];
    let found = 0;
    for (const tx of sorted) {
      const ts = txTs(tx);
      if (ts > t0 && found < 3) {
        nextThree.push(classifyAction(tx, me, medianPls));
        found++;
      }
      if (found === 3) break;
    }
    if (nextThree.length === 3) {
      const key = nextThree.join('|');
      chainCounts[key] = (chainCounts[key] || 0) + 1;
    }
  }
  const sortedKeys = Object.entries(chainCounts).sort((a, b) => b[1] - a[1]);
  if (sortedKeys.length === 0) return [];
  return sortedKeys[0][0].split('|');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario helper: common trigger/context metadata
// ─────────────────────────────────────────────────────────────────────────────

interface ScenarioContextBundle {
  triggerTimes: number[];
  lastTriggerTs: number;
  ctx: ScenarioContext;
  baselines: BaselinesWithContext;
  medianPls: number;
  me: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1 — AFTER_LARGE_TRANSFER (dynamic threshold p80 — task #6)
// ─────────────────────────────────────────────────────────────────────────────

function scenarioAfterLargeTransfer(
  txs: Transaction[],
  walletAddress: string,
  baselines: BaselinesWithContext,
  ctx: ScenarioContext
): ScenarioResult {
  const me = walletAddress.toLowerCase();
  const inflows = txs.filter((t) => t.to?.toLowerCase() === me && txPls(t) > 0);
  const inflowValues = inflows.map(txPls);
  const threshold = inflowValues.length >= 3 ? percentile(inflowValues, 0.8) : 0;
  const largeIncoming = threshold > 0
    ? inflows.filter((t) => txPls(t) > threshold).sort((a, b) => txTs(a) - txTs(b))
    : [];
  const lastLarge = largeIncoming[largeIncoming.length - 1] ?? null;
  const nowSeconds = Date.now() / 1000;
  const timeSinceHours = lastLarge ? (nowSeconds - txTs(lastLarge)) / HOUR : Infinity;
  const triggered = lastLarge !== null && timeSinceHours <= 48;

  const triggerTimes = largeIncoming.map(txTs);
  const nonZero = txs.filter((t) => txPls(t) > 0);
  const medianPls = median(nonZero.map(txPls));

  const classifier = (tx: Transaction | null): string => {
    if (!tx) return 'stayed_inactive';
    const isOut = tx.from?.toLowerCase() === me;
    if (isContract(tx) && isOut) return 'sent_to_dex';
    if (isOut && lastLarge && tx.to?.toLowerCase() === lastLarge.from?.toLowerCase()) return 'sent_back';
    if (isOut && txPls(tx) > 0) {
      if (isContract(tx) && txPls(tx) > 0) return 'bought_tokens';
      return 'sent_to_wallet';
    }
    return 'stayed_inactive';
  };

  const { buckets, samples } = aggregateFollowups(
    txs, walletAddress, triggerTimes, 48 * HOUR, classifier, medianPls
  );
  const expected = ['sent_to_dex', 'sent_to_wallet', 'bought_tokens', 'stayed_inactive', 'sent_back'];
  const outcomes = bucketsToOutcomes(buckets, expected, baselines, ctx, samples, ['stayed_inactive']);
  const { confidence, baseConfidence, reliabilityFactor } = computeConfidence(
    samples, outcomes, computeRecencyWeight(isFinite(timeSinceHours) ? timeSinceHours / 24 : 365), 0
  );
  const decay = decayForScenario('after_large_transfer', confidence);
  const sequence = buildSequenceChain(txs, triggerTimes, me, medianPls);

  const description = triggered
    ? `Large incoming PLS transfer (${txPls(lastLarge!).toFixed(2)} PLS, p80 threshold ${threshold.toFixed(2)})`
    : lastLarge
      ? `No recent large incoming transfer (last one ${(timeSinceHours / 24).toFixed(1)}d ago)`
      : 'No historical large incoming transfers';

  return {
    id: 'after_large_transfer',
    name: 'After Large Transfer',
    triggered,
    hypotheticalDescription: 'If a large incoming transfer arrives, this wallet historically:',
    trigger: {
      type: 'large_incoming',
      description,
      strength: lastLarge ? clamp(txPls(lastLarge) / Math.max(threshold * 2, 1), 0, 1) : 0,
      lastOccurrence: lastLarge ? new Date(txTs(lastLarge) * 1000).toISOString() : new Date(0).toISOString(),
      timeSinceTriggerHours: isFinite(timeSinceHours) ? Math.round(timeSinceHours * 10) / 10 : -1,
    },
    context: ctx,
    outcomes,
    sequenceChain: sequence,
    sampleSize: samples,
    reliabilityFactor,
    baseConfidence,
    confidence,
    priorityScore: triggered ? clamp((confidence / 100) * (outcomes[0]?.probability ?? 0), 0, 1) : 0,
    decayByTimeframe: decay,
    isHighConviction: false,
    highConvictionReason: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2 — AFTER_PRICE_PUMP
// ─────────────────────────────────────────────────────────────────────────────

function scenarioAfterPricePump(
  txs: Transaction[],
  walletAddress: string,
  ohlcv: OhlcvCandle[],
  baselines: BaselinesWithContext,
  ctx: ScenarioContext
): ScenarioResult {
  const me = walletAddress.toLowerCase();

  const pumpDays: number[] = [];
  for (let i = 0; i < ohlcv.length - 1; i++) {
    const today = ohlcv[i];
    const yesterday = ohlcv[i + 1];
    if (yesterday.close > 0 && (today.close - yesterday.close) / yesterday.close > 0.15) {
      pumpDays.push(today.timestamp);
    }
  }
  const latestIsPump = ohlcv.length > 0 && pumpDays.includes(ohlcv[0].timestamp);
  const lastPumpTs = pumpDays[0] ?? 0;
  const nowSeconds = Date.now() / 1000;
  const timeSinceHours = lastPumpTs > 0 ? (nowSeconds - lastPumpTs) / HOUR : Infinity;
  const triggered = latestIsPump || (pumpDays.length > 0 && timeSinceHours <= 48);

  const nonZero = txs.filter((t) => txPls(t) > 0);
  const medianPls = median(nonZero.map(txPls));

  const classifier = (tx: Transaction | null): string => {
    if (!tx) return 'did_nothing';
    const isOut = tx.from?.toLowerCase() === me;
    const isIn = tx.to?.toLowerCase() === me;
    if (isOut && isContract(tx)) return 'bought_more_fomo';
    if (isOut && txPls(tx) > medianPls * 3) return 'sold_profit';
    if (isIn && txPls(tx) > medianPls * 3) return 'bought_more_fomo';
    if (isOut) return 'moved_to_stablecoin';
    return 'did_nothing';
  };

  const { buckets, samples } = aggregateFollowups(
    txs, walletAddress, pumpDays, 48 * HOUR, classifier, medianPls
  );
  const expected = ['bought_more_fomo', 'sold_profit', 'did_nothing', 'moved_to_stablecoin'];
  const outcomes = bucketsToOutcomes(buckets, expected, baselines, ctx, samples, ['did_nothing']);
  const { confidence, baseConfidence, reliabilityFactor } = computeConfidence(
    samples, outcomes, computeRecencyWeight(isFinite(timeSinceHours) ? timeSinceHours / 24 : 365), 0
  );
  const decay = decayForScenario('after_price_pump', confidence);
  const sequence = buildSequenceChain(txs, pumpDays, me, medianPls);
  const priceChange =
    ohlcv.length >= 2 && ohlcv[1].close > 0
      ? ((ohlcv[0].close - ohlcv[1].close) / ohlcv[1].close) * 100
      : 0;

  const description = triggered
    ? `PLS price rose ${priceChange.toFixed(1)}% in the last 24h`
    : pumpDays.length > 0
      ? `No recent pump (last pump ${(timeSinceHours / 24).toFixed(1)}d ago; current 24h change: ${priceChange.toFixed(1)}%)`
      : 'No historical +15% pumps recorded';

  return {
    id: 'after_price_pump',
    name: 'After Price Pump',
    triggered,
    hypotheticalDescription: 'If PLS pumps +15% in 24h, this wallet historically:',
    trigger: {
      type: 'price_pump_15pct',
      description,
      strength: clamp(priceChange / 30, 0, 1),
      lastOccurrence: lastPumpTs > 0 ? new Date(lastPumpTs * 1000).toISOString() : new Date(0).toISOString(),
      timeSinceTriggerHours: isFinite(timeSinceHours) ? Math.round(timeSinceHours * 10) / 10 : -1,
    },
    context: ctx,
    outcomes,
    sequenceChain: sequence,
    sampleSize: samples,
    reliabilityFactor,
    baseConfidence,
    confidence,
    priorityScore: triggered ? clamp((confidence / 100) * (outcomes[0]?.probability ?? 0), 0, 1) : 0,
    decayByTimeframe: decay,
    isHighConviction: false,
    highConvictionReason: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3 — AFTER_INACTIVITY (dynamic p90 threshold — task #6)
// ─────────────────────────────────────────────────────────────────────────────

function scenarioAfterInactivity(
  txs: Transaction[],
  walletAddress: string,
  baselines: BaselinesWithContext,
  ctx: ScenarioContext
): ScenarioResult {
  const sorted = [...txs].sort((a, b) => txTs(a) - txTs(b));
  const me = walletAddress.toLowerCase();
  const nowSeconds = Date.now() / 1000;
  const lastTxTs = sorted.length > 0 ? txTs(sorted[sorted.length - 1]) : 0;
  const timeSinceHours = lastTxTs > 0 ? (nowSeconds - lastTxTs) / HOUR : 0;

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(txTs(sorted[i]) - txTs(sorted[i - 1]));
  }
  const inactivityThresholdSec = Math.max(7 * DAY, percentile(gaps, 0.9));
  const triggered = lastTxTs > 0 && timeSinceHours * HOUR >= inactivityThresholdSec;

  const gapStarts: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (gaps[i - 1] >= inactivityThresholdSec) {
      gapStarts.push(txTs(sorted[i - 1]));
    }
  }

  const nonZero = txs.filter((t) => txPls(t) > 0);
  const medianPls = median(nonZero.map(txPls));

  const classifier = (tx: Transaction | null): string => {
    if (!tx) return 'continued_inactivity';
    const val = txPls(tx);
    if (isContract(tx)) return 'contract_interaction';
    if (val > medianPls * 3) return 'large_transaction';
    return 'small_transaction';
  };

  const { buckets, samples } = aggregateFollowups(
    txs, walletAddress, gapStarts, 30 * DAY, classifier, medianPls
  );
  const expected = ['large_transaction', 'small_transaction', 'contract_interaction', 'continued_inactivity'];
  const outcomes = bucketsToOutcomes(buckets, expected, baselines, ctx, samples, ['continued_inactivity']);
  const { confidence, baseConfidence, reliabilityFactor } = computeConfidence(samples, outcomes, 0.5, 0);
  const decay = decayForScenario('after_inactivity', confidence);
  const sequence = buildSequenceChain(txs, gapStarts, me, medianPls);

  const description = triggered
    ? `Wallet has been inactive for ${(timeSinceHours / 24).toFixed(1)} days (p90 threshold: ${(inactivityThresholdSec / DAY).toFixed(1)}d)`
    : `Last transaction was ${(timeSinceHours / 24).toFixed(1)} days ago (threshold: ${(inactivityThresholdSec / DAY).toFixed(1)}d)`;

  return {
    id: 'after_inactivity',
    name: 'After Inactivity',
    triggered,
    hypotheticalDescription: triggered
      ? `Since this wallet has been inactive ${(timeSinceHours / 24).toFixed(0)} days, based on its past inactivity periods:`
      : 'If the wallet becomes inactive, based on past inactivity periods:',
    trigger: {
      type: 'inactivity_dynamic',
      description,
      strength: clamp(timeSinceHours / (30 * 24), 0, 1),
      lastOccurrence: lastTxTs > 0 ? new Date(lastTxTs * 1000).toISOString() : new Date(0).toISOString(),
      timeSinceTriggerHours: Math.round(timeSinceHours * 10) / 10,
    },
    context: ctx,
    outcomes,
    sequenceChain: sequence,
    sampleSize: samples,
    reliabilityFactor,
    baseConfidence,
    confidence,
    priorityScore: triggered ? clamp((confidence / 100) * (outcomes[0]?.probability ?? 0), 0, 1) : 0,
    decayByTimeframe: decay,
    isHighConviction: false,
    highConvictionReason: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4 — AFTER_LOSS
// ─────────────────────────────────────────────────────────────────────────────

interface SimpleTrade { entryTs: number; exitTs: number; pnlUsd: number; exitPls: number; }

function buildSimpleTrades(
  txs: Transaction[], walletAddress: string, priceMap: Map<number, number>, currentPlsPrice: number
): SimpleTrade[] {
  const me = walletAddress.toLowerCase();
  const queue: { ts: number; pls: number; usd: number }[] = [];
  const trades: SimpleTrade[] = [];
  const sorted = [...txs].sort((a, b) => txTs(a) - txTs(b));
  for (const tx of sorted) {
    const pls = txPls(tx);
    if (pls === 0) continue;
    const ts = txTs(tx);
    const usd = pls * priceAt(ts, priceMap, currentPlsPrice);
    if (tx.to?.toLowerCase() === me) {
      queue.push({ ts, pls, usd });
    } else if (tx.from?.toLowerCase() === me) {
      let remaining = pls;
      let matchedCost = 0;
      let entryTs = ts;
      while (remaining > 0 && queue.length > 0) {
        const head = queue[0];
        const take = Math.min(head.pls, remaining);
        const frac = take / head.pls;
        matchedCost += head.usd * frac;
        entryTs = head.ts;
        head.pls -= take;
        head.usd -= head.usd * frac;
        remaining -= take;
        if (head.pls < 1e-12) queue.shift();
      }
      if (matchedCost > 0) {
        trades.push({
          entryTs, exitTs: ts,
          pnlUsd: usd - matchedCost - remaining * priceAt(ts, priceMap, currentPlsPrice),
          exitPls: pls,
        });
      }
    }
  }
  return trades;
}

function scenarioAfterLoss(
  txs: Transaction[],
  walletAddress: string,
  ohlcv: OhlcvCandle[],
  baselines: BaselinesWithContext,
  ctx: ScenarioContext
): { result: ScenarioResult; isRevengeAlert: boolean } {
  const priceMap = buildPlsPriceMap(ohlcv);
  const currentPlsPrice = ohlcv[0]?.close ?? 0;
  const trades = buildSimpleTrades(txs, walletAddress, priceMap, currentPlsPrice);
  const losses = trades.filter((t) => t.pnlUsd < 0);
  const lastTrade = trades[trades.length - 1] ?? null;
  const nowSeconds = Date.now() / 1000;
  const timeSinceHours = lastTrade ? (nowSeconds - lastTrade.exitTs) / HOUR : Infinity;
  const triggered =
    !!lastTrade && lastTrade.pnlUsd < 0 && timeSinceHours <= 48 && losses.length > 0;

  const me = walletAddress.toLowerCase();
  const nonZero = txs.filter((t) => txPls(t) > 0);
  const medianPls = median(nonZero.map(txPls));
  const triggerTimes = losses.map((l) => l.exitTs);

  const classifier = (tx: Transaction | null): string => {
    if (!tx) return 'complete_inactivity';
    const val = txPls(tx);
    if (val > medianPls * 2) return 'revenge_large_trade';
    if (val > 0 && val < medianPls) return 'cautious_small_trade';
    return 'normal_trade';
  };

  const { buckets, samples } = aggregateFollowups(
    txs, walletAddress, triggerTimes, 6 * HOUR, classifier, medianPls
  );
  const expected = ['revenge_large_trade', 'cautious_small_trade', 'complete_inactivity', 'normal_trade'];
  const outcomes = bucketsToOutcomes(buckets, expected, baselines, ctx, samples, ['complete_inactivity']);
  const { confidence, baseConfidence, reliabilityFactor } = computeConfidence(
    samples, outcomes, computeRecencyWeight(isFinite(timeSinceHours) ? timeSinceHours / 24 : 365), 0
  );
  const decay = decayForScenario('after_loss', confidence);
  const sequence = buildSequenceChain(txs, triggerTimes, me, medianPls);
  const revengeProb = outcomes.find((o) => o.action === 'revenge_large_trade')?.probability ?? 0;
  const isRevengeAlert = triggered && revengeProb > 0.6;

  const description = triggered
    ? `Last trade was a loss of $${Math.abs(lastTrade!.pnlUsd).toFixed(2)}`
    : losses.length > 0
      ? `No recent losing trade (${losses.length} historical losses)`
      : 'No historical losing trades recorded';

  return {
    result: {
      id: 'after_loss',
      name: 'After Loss',
      triggered,
      hypotheticalDescription: 'If the next trade results in a loss, this wallet historically:',
      trigger: {
        type: 'recent_loss',
        description,
        strength: lastTrade ? clamp(Math.abs(lastTrade.pnlUsd) / 100, 0.3, 1) : 0,
        lastOccurrence: lastTrade ? new Date(lastTrade.exitTs * 1000).toISOString() : new Date(0).toISOString(),
        timeSinceTriggerHours: isFinite(timeSinceHours) ? Math.round(timeSinceHours * 10) / 10 : -1,
      },
      context: ctx,
      outcomes,
      sequenceChain: sequence,
      sampleSize: samples,
      reliabilityFactor,
      baseConfidence,
      confidence,
      priorityScore: triggered
        ? clamp((confidence / 100) * (outcomes[0]?.probability ?? 0) * (isRevengeAlert ? 1.3 : 1), 0, 1)
        : 0,
      decayByTimeframe: decay,
      isHighConviction: false,
      highConvictionReason: null,
    },
    isRevengeAlert,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5 — AFTER_CONTRACT_INTERACTION
// ─────────────────────────────────────────────────────────────────────────────

function scenarioAfterContract(
  txs: Transaction[],
  walletAddress: string,
  baselines: BaselinesWithContext,
  ctx: ScenarioContext
): ScenarioResult {
  const me = walletAddress.toLowerCase();
  const contractTxs = txs.filter((t) => isContract(t) && t.from?.toLowerCase() === me);
  const sorted = [...txs].sort((a, b) => txTs(b) - txTs(a));
  const lastTx = sorted[0] ?? null;
  const nowSeconds = Date.now() / 1000;
  const lastTxIsContract = !!lastTx && isContract(lastTx) && lastTx.from?.toLowerCase() === me;
  const timeSinceHours = lastTx ? (nowSeconds - txTs(lastTx)) / HOUR : Infinity;
  const triggered = lastTxIsContract && timeSinceHours <= 24;

  const triggerTimes = contractTxs.map(txTs);
  const nonZero = txs.filter((t) => txPls(t) > 0);
  const medianPls = median(nonZero.map(txPls));

  const classifier = (tx: Transaction | null): string => {
    if (!tx) return 'inactivity';
    if (isContract(tx)) return 'another_contract_call';
    const isOut = tx.from?.toLowerCase() === me;
    if (isOut) return 'withdrawal_to_wallet';
    return 'token_purchase';
  };

  const { buckets, samples } = aggregateFollowups(
    txs, walletAddress, triggerTimes, 6 * HOUR, classifier, medianPls
  );
  const expected = ['another_contract_call', 'withdrawal_to_wallet', 'token_purchase', 'inactivity'];
  const outcomes = bucketsToOutcomes(buckets, expected, baselines, ctx, samples, ['inactivity']);
  const { confidence, baseConfidence, reliabilityFactor } = computeConfidence(
    samples, outcomes, computeRecencyWeight(isFinite(timeSinceHours) ? timeSinceHours / 24 : 365), 0
  );
  const decay = decayForScenario('after_contract_interaction', confidence);
  const sequence = buildSequenceChain(txs, triggerTimes, me, medianPls);

  const description = triggered
    ? 'Last transaction was a contract call'
    : contractTxs.length > 0
      ? `No recent contract call (${contractTxs.length} historical contract interactions)`
      : 'No historical contract interactions';

  return {
    id: 'after_contract_interaction',
    name: 'After Contract Interaction',
    triggered,
    hypotheticalDescription: 'After the next contract interaction, this wallet historically:',
    trigger: {
      type: 'contract_call',
      description,
      strength: triggered ? 0.8 : 0,
      lastOccurrence: lastTx ? new Date(txTs(lastTx) * 1000).toISOString() : new Date(0).toISOString(),
      timeSinceTriggerHours: isFinite(timeSinceHours) ? Math.round(timeSinceHours * 10) / 10 : -1,
    },
    context: ctx,
    outcomes,
    sequenceChain: sequence,
    sampleSize: samples,
    reliabilityFactor,
    baseConfidence,
    confidence,
    priorityScore: triggered ? clamp((confidence / 100) * (outcomes[0]?.probability ?? 0), 0, 1) : 0,
    decayByTimeframe: decay,
    isHighConviction: false,
    highConvictionReason: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 6 — TIME_PATTERN
// ─────────────────────────────────────────────────────────────────────────────

function scenarioTimePattern(
  txs: Transaction[],
  walletAddress: string,
  ctx: ScenarioContext
): ScenarioResult | null {
  if (txs.length === 0) return null;
  const hourly = Array(24).fill(0) as number[];
  const weekday = Array(7).fill(0) as number[];
  for (const tx of txs) {
    const d = new Date(txTs(tx) * 1000);
    hourly[d.getUTCHours()]++;
    weekday[d.getUTCDay()]++;
  }
  const total = txs.length;
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentDay = now.getUTCDay();
  const hourProb = bayesianProb(hourly[currentHour], total); // smoothed (task #1)
  const dayProb = bayesianProb(weekday[currentDay], total);

  let peakStart = 0;
  let peakSum = 0;
  for (let h = 0; h < 24; h++) {
    const sum = hourly[h] + hourly[(h + 1) % 24] + hourly[(h + 2) % 24];
    if (sum > peakSum) { peakSum = sum; peakStart = h; }
  }
  const peakEnd = (peakStart + 3) % 24;

  const activeInNextHour = clamp(hourProb, 0, 1);
  const activeToday = clamp(dayProb, 0, 1);
  const sortedTs = [...txs].sort((a, b) => txTs(a) - txTs(b));
  const weeksSpan = Math.max(1, (Date.now() / 1000 - txTs(sortedTs[0])) / (7 * DAY));
  const activeThisWeek = clamp(txs.length / weeksSpan, 0, 1);

  const flatOutcomes: ScenarioOutcome[] = [
    {
      action: 'active_in_next_hour',
      probability: Math.round(activeInNextHour * 1000) / 1000,
      baselineProbability: 1 / 24,
      edge: Math.round((activeInNextHour - 1 / 24) * 1000) / 1000,
      avgTimeToEventHours: 0.5,
      medianTimeHours: 0.5,
      timeDistribution: { lessThan1h: 1, h1to6: 0, h6to24: 0, d1to7: 0, moreThan7d: 0 },
      detail: { description: describeAction('active_in_next_hour'), avgSizePls: 0, commonDestinations: [] },
      isNegative: false,
    },
    {
      action: 'active_today',
      probability: Math.round(activeToday * 1000) / 1000,
      baselineProbability: 1 / 7,
      edge: Math.round((activeToday - 1 / 7) * 1000) / 1000,
      avgTimeToEventHours: 12,
      medianTimeHours: 8,
      timeDistribution: { lessThan1h: 0, h1to6: 0.3, h6to24: 0.7, d1to7: 0, moreThan7d: 0 },
      detail: { description: describeAction('active_today'), avgSizePls: 0, commonDestinations: [] },
      isNegative: false,
    },
    {
      action: 'active_this_week',
      probability: Math.min(1, Math.round(activeThisWeek * 1000) / 1000),
      baselineProbability: 0.5,
      edge: 0,
      avgTimeToEventHours: 84,
      medianTimeHours: 72,
      timeDistribution: { lessThan1h: 0, h1to6: 0, h6to24: 0.3, d1to7: 0.7, moreThan7d: 0 },
      detail: { description: describeAction('active_this_week'), avgSizePls: 0, commonDestinations: [] },
      isNegative: false,
    },
    {
      action: 'inactive',
      probability: Math.max(0, 1 - activeToday),
      baselineProbability: 6 / 7,
      edge: 0,
      avgTimeToEventHours: 0,
      medianTimeHours: 0,
      timeDistribution: { lessThan1h: 0, h1to6: 0, h6to24: 0, d1to7: 0, moreThan7d: 1 },
      detail: { description: describeAction('inactive'), avgSizePls: 0, commonDestinations: [] },
      isNegative: true,
    },
  ].sort((a, b) => b.probability - a.probability);

  const { confidence, baseConfidence, reliabilityFactor } = computeConfidence(txs.length, flatOutcomes, 0.5, 0);
  const decay = decayForScenario('time_pattern', confidence);

  return {
    id: 'time_pattern',
    name: 'Time Pattern',
    triggered: true,
    hypotheticalDescription: 'Based on historical timing patterns, this wallet typically:',
    trigger: {
      type: 'always_active',
      description: `Peak activity window: ${peakStart}:00–${peakEnd}:00 UTC`,
      strength: clamp(peakSum / total, 0, 1),
      lastOccurrence: new Date().toISOString(),
      timeSinceTriggerHours: 0,
    },
    context: ctx,
    outcomes: flatOutcomes,
    sequenceChain: [],
    sampleSize: txs.length,
    reliabilityFactor,
    baseConfidence,
    confidence,
    priorityScore: clamp((confidence / 100) * activeInNextHour, 0, 1),
    decayByTimeframe: decay,
    isHighConviction: false,
    highConvictionReason: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger set extraction (for correlation check — task #7)
// ─────────────────────────────────────────────────────────────────────────────

function triggerSetFor(
  scenarioId: string,
  txs: Transaction[],
  walletAddress: string,
  ohlcv: OhlcvCandle[]
): Set<number> {
  const me = walletAddress.toLowerCase();
  const set = new Set<number>();
  if (scenarioId === 'after_large_transfer') {
    const inflows = txs.filter((t) => t.to?.toLowerCase() === me && txPls(t) > 0);
    const threshold = percentile(inflows.map(txPls), 0.8);
    for (const t of inflows) if (txPls(t) > threshold) set.add(txTs(t));
  } else if (scenarioId === 'after_contract_interaction') {
    for (const t of txs) if (isContract(t) && t.from?.toLowerCase() === me) set.add(txTs(t));
  } else if (scenarioId === 'after_inactivity') {
    const sorted = [...txs].sort((a, b) => txTs(a) - txTs(b));
    for (let i = 1; i < sorted.length; i++) {
      const gap = txTs(sorted[i]) - txTs(sorted[i - 1]);
      if (gap > 7 * DAY) set.add(txTs(sorted[i - 1]));
    }
  } else if (scenarioId === 'after_price_pump') {
    for (let i = 0; i < ohlcv.length - 1; i++) {
      if (ohlcv[i + 1].close > 0 && (ohlcv[i].close - ohlcv[i + 1].close) / ohlcv[i + 1].close > 0.15) {
        set.add(ohlcv[i].timestamp);
      }
    }
  } else if (scenarioId === 'after_loss') {
    // Use all tx timestamps as proxy (losses are trade-level, not tx-level)
    for (const t of txs) set.add(txTs(t));
  }
  return set;
}

function jaccard(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach((v) => { if (b.has(v)) inter++; });
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Regime shift detection (task #10)
// ─────────────────────────────────────────────────────────────────────────────

function detectRegimeShift(txs: Transaction[], walletAddress: string): {
  shift: boolean;
  reasons: string[];
} {
  if (txs.length < 20) return { shift: false, reasons: [] };
  const sorted = [...txs].sort((a, b) => txTs(b) - txTs(a));
  const last10 = sorted.slice(0, 10);
  const rest = sorted.slice(10);
  const me = walletAddress.toLowerCase();

  function avgTxSize(ts: Transaction[]): number {
    const vals = ts.map(txPls).filter((v) => v > 0);
    return mean(vals);
  }
  function contractRate(ts: Transaction[]): number {
    if (ts.length === 0) return 0;
    return ts.filter(isContract).length / ts.length;
  }
  function txFrequency(ts: Transaction[]): number {
    if (ts.length < 2) return 0;
    const sortedTs = ts.map(txTs).sort((a, b) => a - b);
    const span = sortedTs[sortedTs.length - 1] - sortedTs[0];
    return span > 0 ? ts.length / (span / DAY) : 0;
  }

  const metrics = [
    { name: 'avg_tx_size', recent: avgTxSize(last10), historical: avgTxSize(rest), hist: rest.map(txPls).filter((v) => v > 0) },
    { name: 'tx_frequency', recent: txFrequency(last10), historical: txFrequency(rest), hist: [] as number[] },
    { name: 'contract_rate', recent: contractRate(last10), historical: contractRate(rest), hist: [] as number[] },
  ];

  const reasons: string[] = [];
  let shift = false;
  for (const m of metrics) {
    const s = stdDev(m.hist);
    if (s > 0) {
      const z = Math.abs(m.recent - m.historical) / s;
      if (z > 2) {
        shift = true;
        reasons.push(`${m.name} changed by ${z.toFixed(1)}σ (recent=${m.recent.toFixed(3)} vs historical=${m.historical.toFixed(3)})`);
      }
    } else if (m.historical > 0 && Math.abs(m.recent - m.historical) / m.historical > 0.5) {
      shift = true;
      reasons.push(`${m.name} shifted significantly: recent=${m.recent.toFixed(3)} vs historical=${m.historical.toFixed(3)}`);
    }
  }
  return { shift, reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry: runForecast
// ─────────────────────────────────────────────────────────────────────────────

export function runForecast(
  txs: Transaction[],
  walletAddress: string,
  ohlcv: OhlcvCandle[]
): CurrentState & { baselines: Baselines } {
  // Task #11: baselines computed from ALL txs; scenarios use last 200
  const baselines = computeBaselines(txs, walletAddress, ohlcv);
  const sortedRecent = [...txs].sort((a, b) => txTs(b) - txTs(a));
  const scenarioTxs = sortedRecent.slice(0, SCENARIO_TX_WINDOW);

  const ctx = currentContext(scenarioTxs, ohlcv);
  const nowSeconds = Date.now() / 1000;
  const lastTxHoursAgo = sortedRecent[0] ? (nowSeconds - txTs(sortedRecent[0])) / HOUR : Infinity;

  // Regime shift detection (task #10) — uses all txs
  const regime = detectRegimeShift(txs, walletAddress);
  const regimeMultiplier = regime.shift ? 0.75 : 1.0;

  const warnings: string[] = [];
  if (regime.shift) {
    warnings.push('Recent behavior differs significantly from historical patterns. Forecast accuracy reduced.');
    for (const r of regime.reasons) warnings.push(r);
  }

  const rawResults: (ScenarioResult | null)[] = [];
  rawResults.push(scenarioAfterLargeTransfer(scenarioTxs, walletAddress, baselines, ctx));
  rawResults.push(scenarioAfterPricePump(scenarioTxs, walletAddress, ohlcv, baselines, ctx));
  rawResults.push(scenarioAfterInactivity(txs, walletAddress, baselines, ctx)); // uses all for inactivity
  const lossResult = scenarioAfterLoss(scenarioTxs, walletAddress, ohlcv, baselines, ctx);
  rawResults.push(lossResult.result);
  rawResults.push(scenarioAfterContract(scenarioTxs, walletAddress, baselines, ctx));
  rawResults.push(scenarioTimePattern(txs, walletAddress, ctx)); // uses all for patterns

  const all = rawResults.filter((r): r is ScenarioResult => r !== null);
  // Apply regime multiplier to all confidences
  for (const s of all) {
    s.confidence = Math.round(s.confidence * regimeMultiplier);
    s.priorityScore = clamp(s.priorityScore * regimeMultiplier, 0, 1);
  }

  // Task #7: correlation check — for each pair, if jaccard > 0.7, reduce combined confidence
  const active = all.filter((r) => r.priorityScore > 0.3);
  let lowClarity = false;

  if (active.length >= 2) {
    // Contradiction check: top outcomes disagree in direction
    const topActions = active.map((s) => s.outcomes[0]?.action ?? '');
    const positiveActions = ['sent_to_dex', 'bought_tokens', 'bought_more_fomo', 'large_transaction', 'token_purchase', 'active_in_next_hour', 'active_today', 'revenge_large_trade'];
    const hasBuy = topActions.some((a) => positiveActions.includes(a));
    const hasSell = topActions.some((a) => ['sold_profit', 'moved_to_stablecoin', 'sent_to_wallet', 'withdrawal_to_wallet'].includes(a));
    if (hasBuy && hasSell) {
      lowClarity = true;
      warnings.push('Scenarios show contradicting signals; merged confidence reduced.');
      for (const s of active) s.confidence = Math.round(s.confidence * 0.7);
    }

    // Correlation reduction (task #7)
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const setA = triggerSetFor(active[i].id, txs, walletAddress, ohlcv);
        const setB = triggerSetFor(active[j].id, txs, walletAddress, ohlcv);
        const corr = jaccard(setA, setB);
        if (corr > 0.7) {
          active[i].confidence = Math.round(active[i].confidence * 0.5);
          active[j].confidence = Math.round(active[j].confidence * 0.5);
          warnings.push(`${active[i].name} and ${active[j].name} are highly correlated (Jaccard ${corr.toFixed(2)}); confidences halved.`);
        }
      }
    }
  }

  // High conviction (task #9): 2+ active AND combined_edge > 20% AND outcome_variance < 0.3
  if (active.length >= 2 && !lowClarity) {
    const topActions = active.map((s) => s.outcomes[0]?.action);
    const allAgree = topActions.every((a) => a === topActions[0] && a !== undefined);
    const combinedEdge = active.reduce((s, r) => s + (r.outcomes[0]?.edge ?? 0), 0);
    const topProbs = active.map((s) => s.outcomes[0]?.probability ?? 0);
    const outcomeVar = variance(topProbs);

    if (allAgree && combinedEdge > 0.2 && outcomeVar < 0.3) {
      const combinedSamples = active.reduce((s, r) => s + r.sampleSize, 0);
      for (const s of active) {
        s.isHighConviction = true;
        s.highConvictionReason = `${active.length} scenarios align on "${topActions[0]}" (edge=${(combinedEdge * 100).toFixed(0)}%, variance=${outcomeVar.toFixed(3)}, ${combinedSamples} samples)`;
        s.confidence = Math.min(100, Math.round(s.confidence * 1.15));
      }
    }
  }

  // Always return ALL scenarios. Sort: triggered first, then by priorityScore, then by confidence.
  const finalActive: ScenarioResult[] = [...all].sort((a, b) => {
    if (a.triggered !== b.triggered) return a.triggered ? -1 : 1;
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return b.confidence - a.confidence;
  });

  const triggeredScenarios = finalActive.filter((s) => s.triggered);
  const dominant = triggeredScenarios[0] ?? finalActive[0] ?? null;
  const isHighConviction = finalActive.some((s) => s.isHighConviction);

  return {
    activeScenarios: finalActive,
    dominantScenario: dominant,
    isHighConviction,
    currentWalletPhase: ctx.walletPhase,
    currentMarketPhase: ctx.marketPhase,
    lastTxHoursAgo: Math.round(lastTxHoursAgo * 10) / 10,
    isRevengeAlert: lossResult.isRevengeAlert,
    regimeShift: regime.shift,
    warnings,
    lowClarity,
    baselines,
  };
}
