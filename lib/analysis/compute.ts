import type {
  Transaction,
  AnalysisMetrics,
  BehavioralPatterns,
  NetworkAnalysis,
  Anomaly,
  TokenHolding,
  InteractedWallet,
  RawWalletData,
} from '@/lib/types';
import type { OhlcvCandle } from '@/lib/prices/gecko';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function randomId() {
  return Math.random().toString(36).slice(2);
}

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

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
}

function coefficientOfVariation(xs: number[]): number {
  const m = mean(xs);
  if (m === 0) return 0;
  return stdDev(xs) / m;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function buildPlsPriceMap(ohlcv: OhlcvCandle[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of ohlcv) {
    m.set(Math.floor(c.timestamp / 86400), c.close);
  }
  return m;
}

function plsPriceAt(tsSeconds: number, priceMap: Map<number, number>, fallback: number): number {
  if (priceMap.size === 0) return fallback;
  const day = Math.floor(tsSeconds / 86400);
  if (priceMap.has(day)) return priceMap.get(day)!;
  let best = fallback;
  let bestDiff = Infinity;
  const entries = Array.from(priceMap.entries());
  for (let i = 0; i < entries.length; i++) {
    const [d, p] = entries[i];
    const diff = Math.abs(d - day);
    if (diff < bestDiff) {
      best = p;
      bestDiff = diff;
    }
  }
  return best;
}

interface MatchedTrade {
  entryTs: number;
  exitTs: number;
  entryUsd: number;
  exitUsd: number;
  pnlUsd: number;
  holdingHours: number;
}

/**
 * FIFO-match outgoing PLS against incoming PLS, producing a list of "trades".
 * Each trade represents a matched inflow→outflow pair with historical USD values.
 */
function buildMatchedTrades(
  txs: Transaction[],
  walletAddress: string,
  priceMap: Map<number, number>,
  currentPlsPrice: number
): MatchedTrade[] {
  const me = walletAddress.toLowerCase();
  const queue: { ts: number; pls: number; usd: number }[] = [];
  const trades: MatchedTrade[] = [];
  const sorted = [...txs].sort((a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp));

  for (const tx of sorted) {
    const val = parseInt(tx.value || '0');
    if (val === 0) continue;
    const ts = parseInt(tx.timeStamp);
    const pls = val / 1e18;
    const price = plsPriceAt(ts, priceMap, currentPlsPrice);
    const usd = pls * price;

    if (tx.to?.toLowerCase() === me) {
      queue.push({ ts, pls, usd });
    } else if (tx.from?.toLowerCase() === me) {
      let remaining = pls;
      let matchedCostUsd = 0;
      const entryTsSamples: number[] = [];
      while (remaining > 0 && queue.length > 0) {
        const head = queue[0];
        const take = Math.min(head.pls, remaining);
        const fraction = take / head.pls;
        matchedCostUsd += head.usd * fraction;
        entryTsSamples.push(head.ts);
        head.pls -= take;
        head.usd -= head.usd * fraction;
        remaining -= take;
        if (head.pls < 1e-12) queue.shift();
      }
      if (matchedCostUsd > 0) {
        const entryTs = entryTsSamples[0] ?? ts;
        trades.push({
          entryTs,
          exitTs: ts,
          entryUsd: matchedCostUsd,
          exitUsd: usd - (remaining * price), // only matched portion
          pnlUsd: usd - (remaining * price) - matchedCostUsd,
          holdingHours: (ts - entryTs) / 3600,
        });
      }
    }
  }
  return trades;
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance Layer
// ─────────────────────────────────────────────────────────────────────────────

function computePerformance(
  trades: MatchedTrade[],
  txs: Transaction[],
  walletAddress: string,
  priceMap: Map<number, number>,
  currentPlsPrice: number,
  currentPortfolioUsd: number
): AnalysisMetrics['performance'] {
  const me = walletAddress.toLowerCase();
  const sorted = [...txs].sort((a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp));

  let totalInflowUsd = 0;
  let totalOutflowUsd = 0;
  let runningUsd = 0;
  let peakUsd = 0;
  let maxDrawdownUsd = 0;
  const drawdownEpisodes: number[] = [];
  let currentDrawdown = 0;

  for (const tx of sorted) {
    const val = parseInt(tx.value || '0');
    if (val === 0) continue;
    const ts = parseInt(tx.timeStamp);
    const price = plsPriceAt(ts, priceMap, currentPlsPrice);
    const usd = (val / 1e18) * price;

    if (tx.to?.toLowerCase() === me) {
      totalInflowUsd += usd;
      runningUsd += usd;
    } else if (tx.from?.toLowerCase() === me) {
      totalOutflowUsd += usd;
      runningUsd -= usd;
    }

    if (runningUsd > peakUsd) {
      if (currentDrawdown > 0) {
        drawdownEpisodes.push(currentDrawdown);
        currentDrawdown = 0;
      }
      peakUsd = runningUsd;
    } else {
      const dd = peakUsd - runningUsd;
      if (dd > currentDrawdown) currentDrawdown = dd;
      if (dd > maxDrawdownUsd) maxDrawdownUsd = dd;
    }
  }
  if (currentDrawdown > 0) drawdownEpisodes.push(currentDrawdown);

  const wins = trades.filter((t) => t.pnlUsd > 0);
  const losses = trades.filter((t) => t.pnlUsd < 0);
  const winRate = trades.length > 0 ? Math.round((wins.length / trades.length) * 100) : 0;
  const lossRate = trades.length > 0 ? Math.round((losses.length / trades.length) * 100) : 0;
  const avgProfitUsd = mean(wins.map((t) => t.pnlUsd));
  const avgLossUsd = Math.abs(mean(losses.map((t) => t.pnlUsd)));
  // Expectancy: expected USD per trade
  const expectancy = (winRate / 100) * avgProfitUsd - (lossRate / 100) * avgLossUsd;

  // Streaks
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let curWin = 0;
  let curLoss = 0;
  for (const t of trades) {
    if (t.pnlUsd > 0) {
      curWin++;
      curLoss = 0;
      if (curWin > longestWinStreak) longestWinStreak = curWin;
    } else if (t.pnlUsd < 0) {
      curLoss++;
      curWin = 0;
      if (curLoss > longestLossStreak) longestLossStreak = curLoss;
    } else {
      curWin = 0;
      curLoss = 0;
    }
  }

  const realizedPnlUsd = trades.reduce((s, t) => s + t.pnlUsd, 0);
  // Unrealized PnL = current portfolio value minus unmatched cost basis still held
  const unrealizedPnlUsd = currentPortfolioUsd - (totalInflowUsd - totalOutflowUsd - realizedPnlUsd);
  const totalPnlUsd = realizedPnlUsd + unrealizedPnlUsd;
  const roiPercent = totalInflowUsd > 0 ? (totalPnlUsd / totalInflowUsd) * 100 : 0;

  return {
    realizedPnlUsd,
    unrealizedPnlUsd,
    totalPnlUsd,
    roiPercent,
    totalInflowUsd,
    totalOutflowUsd,
    netFlowUsd: totalInflowUsd - totalOutflowUsd,
    winRate,
    lossRate,
    avgProfitUsd,
    avgLossUsd,
    expectancy,
    maxDrawdownUsd,
    avgDrawdownUsd: mean(drawdownEpisodes),
    pnlStdDev: stdDev(trades.map((t) => t.pnlUsd)),
    longestWinStreak,
    longestLossStreak,
    tradeCount: trades.length,
    ...computePerformanceExtras(trades, priceMap, currentPlsPrice),
  };
}

/**
 * Extra performance metrics: trend direction, entry/exit quality, missed profit.
 * Computed from matched trades + PLS OHLCV day price map.
 */
function computePerformanceExtras(
  trades: MatchedTrade[],
  priceMap: Map<number, number>,
  currentPlsPrice: number
): {
  performanceTrend: 'improving' | 'declining' | 'stable';
  entryQualityScore: number;
  exitQualityScore: number;
  missedProfitPct: number;
} {
  // ── performance_trend: first half vs second half win rate
  let performanceTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (trades.length >= 4) {
    const mid = Math.floor(trades.length / 2);
    const firstHalf = trades.slice(0, mid);
    const secondHalf = trades.slice(mid);
    const wr1 = (firstHalf.filter((t) => t.pnlUsd > 0).length / firstHalf.length) * 100;
    const wr2 = (secondHalf.filter((t) => t.pnlUsd > 0).length / secondHalf.length) * 100;
    const delta = wr2 - wr1;
    if (delta > 10) performanceTrend = 'improving';
    else if (delta < -10) performanceTrend = 'declining';
  }

  // Helper: price window [ts - 7d, ts + 7d] → min and max
  function priceWindow(tsSeconds: number): { min: number; max: number; lastClose: number } {
    const SEVEN_DAYS = 7 * 86400;
    let min = Infinity;
    let max = -Infinity;
    let lastClose = currentPlsPrice;
    const entries = Array.from(priceMap.entries());
    for (let i = 0; i < entries.length; i++) {
      const [day, price] = entries[i];
      const candleTs = day * 86400;
      if (candleTs >= tsSeconds - SEVEN_DAYS && candleTs <= tsSeconds + SEVEN_DAYS) {
        if (price < min) min = price;
        if (price > max) max = price;
      }
    }
    // Max price in the 7 days AFTER exit (for missed_profit)
    let postExitMax = -Infinity;
    for (let i = 0; i < entries.length; i++) {
      const [day, price] = entries[i];
      const candleTs = day * 86400;
      if (candleTs >= tsSeconds && candleTs <= tsSeconds + SEVEN_DAYS) {
        if (price > postExitMax) postExitMax = price;
      }
    }
    return {
      min: min === Infinity ? currentPlsPrice : min,
      max: max === -Infinity ? currentPlsPrice : max,
      lastClose: postExitMax === -Infinity ? currentPlsPrice : postExitMax,
    };
  }

  // ── entry_quality_score: how close each entry was to the 7-day local minimum
  // ── exit_quality_score: how close each exit was to the 7-day local maximum
  // ── missed_profit_pct: % between exit price and 7-day high that followed
  let entryQualitySum = 0;
  let exitQualitySum = 0;
  let missedProfitSum = 0;
  let entryCount = 0;
  let exitCount = 0;
  let missedCount = 0;

  for (const trade of trades) {
    const entryPrice = plsPriceAt(trade.entryTs, priceMap, currentPlsPrice);
    const exitPrice = plsPriceAt(trade.exitTs, priceMap, currentPlsPrice);

    const entryWindow = priceWindow(trade.entryTs);
    const exitWindow = priceWindow(trade.exitTs);

    // Entry quality: 100 if entryPrice == min, scaled by (max - min) band.
    // Specifically: if entry within 10% of min → high score; closer to max → low score.
    const entryRange = entryWindow.max - entryWindow.min;
    if (entryRange > 0) {
      const distanceFromMin = entryPrice - entryWindow.min;
      const normalized = distanceFromMin / entryRange; // 0 (best) → 1 (worst)
      entryQualitySum += Math.round(clamp(100 * (1 - normalized), 0, 100));
      entryCount++;
    }

    // Exit quality: 100 if exitPrice == max
    const exitRange = exitWindow.max - exitWindow.min;
    if (exitRange > 0) {
      const distanceFromMax = exitWindow.max - exitPrice;
      const normalized = distanceFromMax / exitRange;
      exitQualitySum += Math.round(clamp(100 * (1 - normalized), 0, 100));
      exitCount++;
    }

    // Missed profit: % between exit price and post-exit 7-day high
    if (exitPrice > 0) {
      const missed = ((exitWindow.lastClose - exitPrice) / exitPrice) * 100;
      if (missed > 0) {
        missedProfitSum += missed;
        missedCount++;
      }
    }
  }

  return {
    performanceTrend,
    entryQualityScore: entryCount > 0 ? Math.round(entryQualitySum / entryCount) : 0,
    exitQualityScore: exitCount > 0 ? Math.round(exitQualitySum / exitCount) : 0,
    missedProfitPct: missedCount > 0 ? missedProfitSum / missedCount : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Psychology
// ─────────────────────────────────────────────────────────────────────────────

function computePsychology(
  trades: MatchedTrade[],
  txs: Transaction[],
  walletAddress: string,
  priceMap: Map<number, number>,
  currentPlsPrice: number
): AnalysisMetrics['psychology'] {
  const holdingHours = trades.map((t) => t.holdingHours);
  const avgHoldingHours = mean(holdingHours);
  const medianHoldingHours = median(holdingHours);

  // Paper↔Diamond: avg holding time. <1h → 0 (paper), 168h+ (7d) → 100 (diamond)
  const paperVsDiamondIndex = clamp(
    Math.round(((avgHoldingHours - 1) / (168 - 1)) * 100),
    0,
    100
  );

  // FOMO / dip buy: price change in the 24h before each inflow
  const me = walletAddress.toLowerCase();
  const inflows = txs.filter(
    (tx) => tx.to?.toLowerCase() === me && parseInt(tx.value || '0') > 0
  );
  let fomoCount = 0;
  let dipCount = 0;
  for (const tx of inflows) {
    const ts = parseInt(tx.timeStamp);
    const priceNow = plsPriceAt(ts, priceMap, currentPlsPrice);
    const price24hAgo = plsPriceAt(ts - 86400, priceMap, currentPlsPrice);
    if (price24hAgo === 0) continue;
    const change = (priceNow - price24hAgo) / price24hAgo;
    if (change > 0.15) fomoCount++;
    else if (change < -0.15) dipCount++;
  }
  const fomoScore = inflows.length > 0 ? Math.round((fomoCount / inflows.length) * 100) : 0;
  const dipBuyScore = inflows.length > 0 ? Math.round((dipCount / inflows.length) * 100) : 0;

  // Revenge: loss followed by larger trade within 30 min
  let revengeCount = 0;
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (t.pnlUsd >= 0) continue;
    // Find next outflow within 30 min of exit
    const nextTrade = trades[i + 1];
    if (!nextTrade) continue;
    const gap = (nextTrade.entryTs - t.exitTs) / 60; // minutes (entry of next = last inflow time, not perfect)
    if (gap <= 30 && nextTrade.exitUsd > t.exitUsd) revengeCount++;
  }
  const lossCount = trades.filter((t) => t.pnlUsd < 0).length;
  const revengeScore = lossCount > 0 ? Math.round((revengeCount / lossCount) * 100) : 0;

  // Impatience: % failed transactions
  const failed = txs.filter((tx) => tx.isError === '1').length;
  const impatienceScore = txs.length > 0 ? Math.round((failed / txs.length) * 100) : 0;

  return {
    avgHoldingHours,
    medianHoldingHours,
    paperVsDiamondIndex,
    fomoScore,
    dipBuyScore,
    revengeScore,
    impatienceScore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy
// ─────────────────────────────────────────────────────────────────────────────

function computeStrategy(
  txs: Transaction[],
  walletAddress: string,
  avgHoldingHours: number
): AnalysisMetrics['strategy'] {
  const me = walletAddress.toLowerCase();
  const outflows = txs.filter(
    (tx) => tx.from?.toLowerCase() === me && parseInt(tx.value || '0') > 0
  );

  // DCA: group outflows by destination; within each group, check if intervals
  // are regular (CV < 0.3) and amounts are similar (CV < 0.3).
  const byDest: Record<string, Transaction[]> = {};
  for (const tx of outflows) {
    const dest = tx.to?.toLowerCase() ?? 'unknown';
    (byDest[dest] ||= []).push(tx);
  }
  let dcaMatched = 0;
  let dcaTotal = 0;
  const destKeys = Object.keys(byDest);
  for (let i = 0; i < destKeys.length; i++) {
    const group = byDest[destKeys[i]];
    if (group.length < 3) {
      dcaTotal += group.length;
      continue;
    }
    const intervals: number[] = [];
    const amounts: number[] = [];
    for (let j = 1; j < group.length; j++) {
      intervals.push(parseInt(group[j].timeStamp) - parseInt(group[j - 1].timeStamp));
      amounts.push(parseInt(group[j].value || '0') / 1e18);
    }
    amounts.unshift(parseInt(group[0].value || '0') / 1e18);
    const intervalCv = coefficientOfVariation(intervals);
    const amountCv = coefficientOfVariation(amounts);
    dcaTotal += group.length;
    if (intervalCv < 0.3 && amountCv < 0.3) dcaMatched += group.length;
  }
  const dcaScore = dcaTotal > 0 ? Math.round((dcaMatched / dcaTotal) * 100) : 0;

  // Trading style
  let tradingStyle: 'scalper' | 'swing' | 'holder' | 'unknown' = 'unknown';
  if (avgHoldingHours === 0) tradingStyle = 'unknown';
  else if (avgHoldingHours < 1) tradingStyle = 'scalper';
  else if (avgHoldingHours < 168) tradingStyle = 'swing';
  else tradingStyle = 'holder';

  // Position sizing: linear regression slope on outflow amounts over time
  let positionSizing: 'fixed' | 'increasing' | 'decreasing' | 'mixed' = 'mixed';
  if (outflows.length >= 5) {
    const amounts = outflows.map((tx) => parseInt(tx.value || '0') / 1e18);
    const cv = coefficientOfVariation(amounts);
    if (cv < 0.2) {
      positionSizing = 'fixed';
    } else {
      // Compute Spearman-like correlation with index
      const n = amounts.length;
      const meanX = (n - 1) / 2;
      const meanY = mean(amounts);
      let num = 0;
      let denX = 0;
      let denY = 0;
      for (let i = 0; i < n; i++) {
        num += (i - meanX) * (amounts[i] - meanY);
        denX += (i - meanX) ** 2;
        denY += (amounts[i] - meanY) ** 2;
      }
      const corr = denX && denY ? num / Math.sqrt(denX * denY) : 0;
      if (corr > 0.4) positionSizing = 'increasing';
      else if (corr < -0.4) positionSizing = 'decreasing';
      else positionSizing = 'mixed';
    }
  }

  // Entry style: count inflows per source; if most sources give 1 chunk → single, many small chunks → ladder
  const inflows = txs.filter(
    (tx) => tx.to?.toLowerCase() === me && parseInt(tx.value || '0') > 0
  );
  const bySrc: Record<string, number> = {};
  for (const tx of inflows) {
    const src = tx.from?.toLowerCase() ?? 'unknown';
    bySrc[src] = (bySrc[src] || 0) + 1;
  }
  const srcCounts = Object.values(bySrc);
  const multiEntrySources = srcCounts.filter((c) => c >= 3).length;
  const totalSources = srcCounts.length;
  let entryStyle: 'single' | 'ladder' | 'mixed' = 'mixed';
  if (totalSources > 0) {
    const ladderRatio = multiEntrySources / totalSources;
    if (ladderRatio < 0.2) entryStyle = 'single';
    else if (ladderRatio > 0.6) entryStyle = 'ladder';
    else entryStyle = 'mixed';
  }

  // Exit style: same logic on destinations
  const byDestCount: Record<string, number> = {};
  for (const tx of outflows) {
    const dest = tx.to?.toLowerCase() ?? 'unknown';
    byDestCount[dest] = (byDestCount[dest] || 0) + 1;
  }
  const destCounts = Object.values(byDestCount);
  const multiExitDests = destCounts.filter((c) => c >= 3).length;
  const totalDests = destCounts.length;
  let exitStyle: 'full' | 'partial' | 'mixed' = 'mixed';
  if (totalDests > 0) {
    const partialRatio = multiExitDests / totalDests;
    if (partialRatio < 0.2) exitStyle = 'full';
    else if (partialRatio > 0.6) exitStyle = 'partial';
    else exitStyle = 'mixed';
  }

  return { dcaScore, tradingStyle, positionSizing, entryStyle, exitStyle };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bot detection
// ─────────────────────────────────────────────────────────────────────────────

function computeBotDetection(txs: Transaction[]): AnalysisMetrics['bot'] {
  if (txs.length === 0) {
    return {
      preciseAmountsPct: 0,
      timingRegularityScore: 0,
      repeatedPatternScore: 0,
      gasConsistencyScore: 0,
      botProbability: 0,
      botConfidence: 0,
    };
  }

  // Precise amounts: non-round values (not multiples of whole PLS) = bot-like
  const nonZero = txs.filter((tx) => parseInt(tx.value || '0') > 0);
  const preciseCount = nonZero.filter((tx) => {
    const val = parseInt(tx.value || '0');
    return val > 0 && val % 1e18 !== 0;
  }).length;
  const preciseAmountsPct =
    nonZero.length > 0 ? Math.round((preciseCount / nonZero.length) * 100) : 0;

  // Timing regularity: CV of intervals (low CV = regular = bot-like). Score inverted (0-100).
  const sorted = [...txs].sort((a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp));
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(parseInt(sorted[i].timeStamp) - parseInt(sorted[i - 1].timeStamp));
  }
  const intervalCv = coefficientOfVariation(intervals);
  const timingRegularityScore = clamp(Math.round(100 * Math.exp(-intervalCv)), 0, 100);

  // Repeated pattern: count (value_bucket, to) pairs that repeat
  const patternCounts: Record<string, number> = {};
  for (const tx of nonZero) {
    const valBucket = Math.floor((parseInt(tx.value || '0') / 1e18) / 0.01); // 0.01 PLS buckets
    const key = `${valBucket}:${tx.to?.toLowerCase() ?? ''}`;
    patternCounts[key] = (patternCounts[key] || 0) + 1;
  }
  const repeats = Object.values(patternCounts).filter((c) => c > 1);
  const repeatedPatternScore =
    nonZero.length > 0
      ? Math.round((repeats.reduce((s, c) => s + c, 0) / nonZero.length) * 100)
      : 0;

  // Gas consistency: CV of gas prices. Low CV = consistent = bot-like.
  const gasPrices = txs.map((tx) => parseInt(tx.gasPrice || '0')).filter((v) => v > 0);
  const gasCv = coefficientOfVariation(gasPrices);
  const gasConsistencyScore = clamp(Math.round(100 * Math.exp(-gasCv)), 0, 100);

  // Composite bot probability (weighted)
  const botProbability = Math.round(
    0.35 * timingRegularityScore +
      0.25 * repeatedPatternScore +
      0.2 * gasConsistencyScore +
      0.2 * preciseAmountsPct
  );

  // Confidence: higher with more transactions
  const botConfidence = clamp(Math.round(Math.log10(txs.length + 1) * 25), 0, 100);

  return {
    preciseAmountsPct,
    timingRegularityScore,
    repeatedPatternScore,
    gasConsistencyScore,
    botProbability,
    botConfidence,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Behavior
// ─────────────────────────────────────────────────────────────────────────────

function computeBehavior(txs: Transaction[], walletAgeDays: number): AnalysisMetrics['behavior'] {
  const tradesPerDay = walletAgeDays > 0 ? txs.length / walletAgeDays : 0;
  const tradesPerWeek = tradesPerDay * 7;

  // Bursts: groups of txs within 10 min of each other
  const sorted = [...txs].sort((a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp));
  const BURST_GAP = 600; // 10 min
  const bursts: Transaction[][] = [];
  let cur: Transaction[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || parseInt(sorted[i].timeStamp) - parseInt(sorted[i - 1].timeStamp) <= BURST_GAP) {
      cur.push(sorted[i]);
    } else {
      if (cur.length >= 3) bursts.push(cur);
      cur = [sorted[i]];
    }
  }
  if (cur.length >= 3) bursts.push(cur);
  const burstCount = bursts.length;
  const avgBurstSize = burstCount > 0 ? mean(bursts.map((b) => b.length)) : 0;

  // Hourly + weekday distribution
  const hourlyDistribution = Array(24).fill(0);
  const weekdayPattern = Array(7).fill(0);
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const tx of txs) {
    const d = new Date(parseInt(tx.timeStamp) * 1000);
    hourlyDistribution[d.getHours()]++;
    weekdayPattern[d.getDay()]++;
    heatmap[d.getDay()][d.getHours()]++;
  }

  return {
    tradesPerDay,
    tradesPerWeek,
    burstCount,
    avgBurstSize,
    hourlyDistribution,
    weekdayPattern,
    activityHeatmap: heatmap,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Network
// ─────────────────────────────────────────────────────────────────────────────

function computeNetwork(
  txs: Transaction[],
  walletAddress: string,
  priceMap: Map<number, number>,
  currentPlsPrice: number
): AnalysisMetrics['network'] {
  const me = walletAddress.toLowerCase();
  const counterparties: Record<
    string,
    { count: number; volumeUsd: number; isContract: boolean }
  > = {};
  let inUsd = 0;
  let outUsd = 0;
  let contractTxCount = 0;

  for (const tx of txs) {
    const ts = parseInt(tx.timeStamp);
    const val = parseInt(tx.value || '0') / 1e18;
    const price = plsPriceAt(ts, priceMap, currentPlsPrice);
    const usd = val * price;
    const peer =
      tx.from?.toLowerCase() === me ? tx.to?.toLowerCase() : tx.from?.toLowerCase();
    if (!peer || peer === me) continue;
    if (!counterparties[peer]) {
      counterparties[peer] = { count: 0, volumeUsd: 0, isContract: false };
    }
    counterparties[peer].count++;
    counterparties[peer].volumeUsd += usd;
    // Contract heuristic: input data present when sending to it
    if (tx.from?.toLowerCase() === me && tx.input && tx.input !== '0x') {
      counterparties[peer].isContract = true;
      contractTxCount++;
    }
    if (tx.to?.toLowerCase() === me) inUsd += usd;
    else if (tx.from?.toLowerCase() === me) outUsd += usd;
  }

  const entries = Object.entries(counterparties);
  const topCounterparties = entries
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([address, v]) => ({ address, count: v.count, volumeUsd: v.volumeUsd, isContract: v.isContract }));

  const contractInteractionPct =
    txs.length > 0 ? Math.round((contractTxCount / txs.length) * 100) : 0;
  const eoaInteractionPct = 100 - contractInteractionPct;

  // Circular flow: volume that returns to a previously-sent address
  const sentTo = new Set<string>();
  let circularVolumeUsd = 0;
  const sorted = [...txs].sort((a, b) => parseInt(a.timeStamp) - parseInt(b.timeStamp));
  for (const tx of sorted) {
    const val = parseInt(tx.value || '0') / 1e18;
    const ts = parseInt(tx.timeStamp);
    const price = plsPriceAt(ts, priceMap, currentPlsPrice);
    if (tx.from?.toLowerCase() === me && tx.to) {
      sentTo.add(tx.to.toLowerCase());
    } else if (tx.to?.toLowerCase() === me && tx.from && sentTo.has(tx.from.toLowerCase())) {
      circularVolumeUsd += val * price;
    }
  }
  const circularFlowScore =
    inUsd > 0 ? clamp(Math.round((circularVolumeUsd / inUsd) * 100), 0, 100) : 0;

  return {
    topCounterparties,
    contractInteractionPct,
    eoaInteractionPct,
    circularFlowScore,
    uniqueCounterpartiesCount: entries.length,
    moneyFlowInUsd: inUsd,
    moneyFlowOutUsd: outUsd,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Token
// ─────────────────────────────────────────────────────────────────────────────

function computeToken(
  tokens: TokenHolding[],
  walletAgeDays: number
): AnalysisMetrics['token'] {
  const tokenDiversityCount = tokens.length;

  // Shannon entropy on portfolio distribution
  const total = tokens.reduce((s, t) => s + t.usdValue, 0);
  let entropy = 0;
  if (total > 0) {
    for (const t of tokens) {
      const p = t.usdValue / total;
      if (p > 0) entropy -= p * Math.log2(p);
    }
  }
  const maxEntropy = tokenDiversityCount > 1 ? Math.log2(tokenDiversityCount) : 1;
  const tokenEntropyScore = maxEntropy > 0 ? Math.round((entropy / maxEntropy) * 100) : 0;

  // Dead tokens: holdings with <$0.01 USD value
  const deadCount = tokens.filter((t) => t.usdValue < 0.01).length;
  const deadTokensPct =
    tokenDiversityCount > 0 ? Math.round((deadCount / tokenDiversityCount) * 100) : 0;

  // Early entry score: proxy — older wallets with many diverse tokens likely entered early.
  // Without token creation dates, we use wallet age × diversity as a proxy (0-100).
  const earlyEntryScore = clamp(
    Math.round((walletAgeDays / 1000) * Math.min(tokenDiversityCount, 30) * 3),
    0,
    100
  );

  return { tokenDiversityCount, tokenEntropyScore, deadTokensPct, earlyEntryScore };
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk
// ─────────────────────────────────────────────────────────────────────────────

function computeRisk(
  tokens: TokenHolding[],
  txs: Transaction[],
  performance: AnalysisMetrics['performance'],
  bot: AnalysisMetrics['bot']
): AnalysisMetrics['risk'] {
  const portfolioValue = tokens.reduce((s, t) => s + t.usdValue, 0);
  const maxConc = tokens.reduce(
    (m, t) => Math.max(m, portfolioValue > 0 ? (t.usdValue / portfolioValue) * 100 : 0),
    0
  );
  const concentrationRisk = Math.min(100, Math.round(maxConc));

  // Large transactions: >3σ from mean value
  const values = txs.map((tx) => parseInt(tx.value || '0') / 1e18);
  const m = mean(values);
  const s = stdDev(values);
  const largeTransactionsCount = values.filter((v) => v > m + 3 * s).length;

  const failedCount = txs.filter((tx) => tx.isError === '1').length;
  const failedTransactionsPct =
    txs.length > 0 ? Math.round((failedCount / txs.length) * 100) : 0;

  // Money laundering risk composite: circular flow + bot-like activity + large tx count
  const mlFromCircular = Math.min(50, largeTransactionsCount * 5);
  const mlFromBot = bot.botProbability > 70 ? 20 : 0;
  const mlFromDrawdown = performance.maxDrawdownUsd > performance.totalInflowUsd * 0.5 ? 10 : 0;
  const moneyLaunderingRisk = clamp(mlFromCircular + mlFromBot + mlFromDrawdown, 0, 100);

  // ── tail_risk_score: % of tx whose PLS value loss exceeds 2× avg loss
  // We don't have per-trade PnL here, so use performance.avgLossUsd as the reference
  // and count transactions whose raw PLS value (as a proxy for position size) exceeds 2× it.
  let tailRiskScore = 0;
  if (performance.avgLossUsd > 0 && performance.tradeCount > 0) {
    // Use matched-trade data via performance metrics: approximate by counting txs
    // with value exceeding 2× the mean non-zero tx value (a proxy for "big trades")
    const nonZeroValues = txs
      .map((tx) => parseInt(tx.value || '0') / 1e18)
      .filter((v) => v > 0);
    const avgValue = nonZeroValues.length > 0
      ? nonZeroValues.reduce((s, v) => s + v, 0) / nonZeroValues.length
      : 0;
    const tailCount = nonZeroValues.filter((v) => v > avgValue * 2).length;
    tailRiskScore = nonZeroValues.length > 0
      ? Math.round((tailCount / nonZeroValues.length) * 100)
      : 0;
  }

  // ── liquidity_risk_score: % of token holdings with usdValue < $10
  const illiquidCount = tokens.filter((t) => t.usdValue < 10).length;
  const liquidityRiskScore = tokens.length > 0
    ? Math.round((illiquidCount / tokens.length) * 100)
    : 0;

  return {
    concentrationRisk,
    largeTransactionsCount,
    failedTransactionsPct,
    moneyLaunderingRisk,
    tailRiskScore,
    liquidityRiskScore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta scores + profile label
// ─────────────────────────────────────────────────────────────────────────────

function computeMetaScores(
  performance: AnalysisMetrics['performance'],
  risk: AnalysisMetrics['risk'],
  bot: AnalysisMetrics['bot'],
  psychology: AnalysisMetrics['psychology'],
  plsOhlcv: OhlcvCandle[]
): AnalysisMetrics['metaScores'] {
  // Skill: win_rate + normalized expectancy + drawdown discipline + consistency
  const normExpectancy = clamp(50 + performance.expectancy / 10, 0, 100);
  const drawdownDiscipline =
    performance.totalInflowUsd > 0
      ? clamp(100 - (performance.maxDrawdownUsd / performance.totalInflowUsd) * 100, 0, 100)
      : 50;
  const consistency = 100 - Math.min(
    100,
    performance.tradeCount > 0 ? (performance.pnlStdDev / (performance.avgProfitUsd + performance.avgLossUsd + 1)) * 20 : 50
  );
  const skillScore = Math.round(
    0.35 * performance.winRate +
      0.25 * normExpectancy +
      0.2 * drawdownDiscipline +
      0.2 * consistency
  );

  // Risk score: higher = riskier
  const riskScore = Math.round(
    0.4 * risk.concentrationRisk +
      0.3 * risk.moneyLaunderingRisk +
      0.15 * risk.failedTransactionsPct +
      0.15 * Math.min(100, risk.largeTransactionsCount * 10)
  );

  // Behavior: consistency of patterns + clarity
  const behaviorScore = Math.round(
    0.4 * (100 - bot.botProbability) + // human-like
      0.3 * (100 - psychology.fomoScore) +
      0.3 * (100 - psychology.revengeScore)
  );

  // Alpha vs PLS benchmark
  let alphaScore = 50;
  if (plsOhlcv.length >= 2 && performance.totalInflowUsd > 0) {
    const firstPrice = plsOhlcv[plsOhlcv.length - 1].close;
    const lastPrice = plsOhlcv[0].close;
    const plsReturn = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
    const walletReturn = performance.roiPercent;
    alphaScore = clamp(Math.round(50 + (walletReturn - plsReturn)), 0, 100);
  }

  return { skillScore, riskScore, behaviorScore, alphaScore };
}

function computeProfileLabel(
  performance: AnalysisMetrics['performance'],
  psychology: AnalysisMetrics['psychology'],
  strategy: AnalysisMetrics['strategy'],
  bot: AnalysisMetrics['bot'],
  network: AnalysisMetrics['network'],
  behavior: AnalysisMetrics['behavior']
): string {
  if (bot.botProbability > 80 && bot.botConfidence > 50) return 'Arbitrage Bot';
  if (network.contractInteractionPct > 70) return 'Yield Farmer';
  if (behavior.tradesPerWeek > 20 && performance.winRate < 45 && performance.avgLossUsd > performance.avgProfitUsd)
    return 'Degenerate Trader';
  if (performance.winRate > 55 && strategy.dcaScore > 40 && psychology.revengeScore < 20)
    return 'Systematic Trader';
  if (strategy.tradingStyle === 'holder' && behavior.tradesPerWeek < 3)
    return 'Passive Holder';
  return 'Retail Trader';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry: computeAllAnalysis
// ─────────────────────────────────────────────────────────────────────────────

export function computeAllAnalysis(
  raw: RawWalletData,
  walletAddress: string,
  prices: Map<string, number> = new Map(),
  plsOhlcv: OhlcvCandle[] = []
): {
  metrics: AnalysisMetrics;
  behavioral_patterns: BehavioralPatterns;
  network_analysis: NetworkAnalysis;
  anomalies: Anomaly[];
} {
  const currentPlsPrice =
    plsOhlcv[0]?.close ??
    prices.get('0xa1077a294dde1b09bb078844df40758a5d0f9a27') ??
    0;
  const plsBalance = parseInt(raw.balance) / 1e18;
  const plsBalanceUsd = plsBalance * currentPlsPrice;

  const tokens: TokenHolding[] = raw.tokens
    .map((t) => {
      const decimals = parseInt(t.decimals || '18');
      const balance = parseInt(t.balance) / Math.pow(10, decimals);
      const price = prices.get(t.contractAddress.toLowerCase()) ?? 0;
      return {
        name: t.name,
        symbol: t.symbol,
        balance,
        usdValue: balance * price,
        portfolioPercent: 0,
      };
    })
    .filter((t) => t.balance > 0);
  const tokensTotal = tokens.reduce((s, t) => s + t.usdValue, 0);
  const portfolioValue = plsBalanceUsd + tokensTotal;
  tokens.forEach((t) => {
    t.portfolioPercent = portfolioValue > 0 ? (t.usdValue / portfolioValue) * 100 : 0;
  });

  const gasFeesPls = raw.transactions.reduce(
    (s, tx) => s + (parseInt(tx.gasUsed || '0') * parseInt(tx.gasPrice || '0')) / 1e18,
    0
  );
  const gasFeesUsd = gasFeesPls * currentPlsPrice;

  const timestamps = raw.transactions.map((tx) => parseInt(tx.timeStamp) * 1000);
  const firstTs = timestamps.length ? Math.min(...timestamps) : Date.now();
  const walletAgeDays = Math.max(1, Math.floor((Date.now() - firstTs) / 86400000));
  const last30Days = raw.transactions.filter(
    (tx) => Date.now() - parseInt(tx.timeStamp) * 1000 < 30 * 86400000
  ).length;
  const activityScore = Math.min(100, Math.round((last30Days / 60) * 100));

  const priceMap = buildPlsPriceMap(plsOhlcv);
  const trades = buildMatchedTrades(raw.transactions, walletAddress, priceMap, currentPlsPrice);

  const performance = computePerformance(
    trades,
    raw.transactions,
    walletAddress,
    priceMap,
    currentPlsPrice,
    portfolioValue
  );
  const psychology = computePsychology(
    trades,
    raw.transactions,
    walletAddress,
    priceMap,
    currentPlsPrice
  );
  const strategy = computeStrategy(raw.transactions, walletAddress, psychology.avgHoldingHours);
  const bot = computeBotDetection(raw.transactions);
  const behavior = computeBehavior(raw.transactions, walletAgeDays);
  const network = computeNetwork(raw.transactions, walletAddress, priceMap, currentPlsPrice);
  const token = computeToken(tokens, walletAgeDays);
  const risk = computeRisk(tokens, raw.transactions, performance, bot);
  const metaScores = computeMetaScores(performance, risk, bot, psychology, plsOhlcv);
  const profileLabel = computeProfileLabel(performance, psychology, strategy, bot, network, behavior);

  // Legacy walletType classification for backward compat
  const txCount = raw.transactions.length;
  let walletType: AnalysisMetrics['walletType'] = 'unknown';
  if (bot.botProbability > 70) walletType = 'bot';
  else if (plsBalance > 1000000) walletType = 'whale';
  else if (strategy.tradingStyle === 'scalper') walletType = 'scalper';
  else if (strategy.tradingStyle === 'swing') walletType = 'swing';
  else if (strategy.tradingStyle === 'holder') walletType = 'holder';
  else if (txCount > 50) walletType = 'trader';

  const metrics: AnalysisMetrics = {
    walletAddress,
    transactionCount: txCount,
    walletAgeDays,
    activityScore,
    walletType,
    portfolio: {
      plsBalance,
      plsBalanceUsd,
      portfolioValue,
      tokens,
      gasFeesPls,
      gasFeesUsd,
    },
    performance,
    psychology,
    strategy,
    bot,
    behavior,
    network,
    token,
    risk,
    metaScores,
    profileLabel,
  };

  // Legacy columns (populated for backward schema compat)
  const legacyBehavioral: BehavioralPatterns = {
    activityHeatmap: behavior.activityHeatmap,
    weeklyRhythm: behavior.weekdayPattern,
    transactionSequences: [],
    recurringActions: [],
    favoriteTokens: tokens.slice(0, 5).map((t) => ({
      name: `${t.name} (${t.symbol})`,
      count: 0,
      volume: t.balance,
    })),
    favoriteProtocols: network.topCounterparties
      .filter((c) => c.isContract)
      .slice(0, 5)
      .map((c) => ({
        name: `${c.address.slice(0, 8)}…${c.address.slice(-6)}`,
        count: c.count,
        volume: c.volumeUsd,
      })),
    buysOnDipPercent: psychology.dipBuyScore,
    avgTimeBetweenTxHours: psychology.avgHoldingHours,
    humanLikeScore: 100 - bot.botProbability,
  };

  const legacyNetwork: NetworkAnalysis = {
    topWallets: network.topCounterparties.map((c) => ({
      address: c.address,
      interactionCount: c.count,
      totalVolume: c.volumeUsd,
      label: c.isContract ? 'contract' : null,
    })) as InteractedWallet[],
    moneyFlowIn: network.moneyFlowInUsd,
    moneyFlowOut: network.moneyFlowOutUsd,
    groupDetection: network.circularFlowScore > 20 ? 'Circular flow detected' : null,
  };

  const anomalies: Anomaly[] = [];
  if (risk.largeTransactionsCount > 0) {
    anomalies.push({
      id: randomId(),
      description: `${risk.largeTransactionsCount} unusually large transaction(s) detected (>3σ from mean)`,
      severity: risk.largeTransactionsCount > 3 ? 'high' : 'medium',
      timestamp: new Date().toISOString(),
    });
  }
  if (risk.failedTransactionsPct > 10) {
    anomalies.push({
      id: randomId(),
      description: `High failure rate: ${risk.failedTransactionsPct}% of transactions failed`,
      severity: 'medium',
      timestamp: new Date().toISOString(),
    });
  }
  if (network.circularFlowScore > 30) {
    anomalies.push({
      id: randomId(),
      description: `Circular flow pattern detected: ${network.circularFlowScore}% of inflow volume returns from previously-sent addresses`,
      severity: 'high',
      timestamp: new Date().toISOString(),
    });
  }
  if (bot.botProbability > 80) {
    anomalies.push({
      id: randomId(),
      description: `Strong bot behavior detected (probability: ${bot.botProbability}%)`,
      severity: 'medium',
      timestamp: new Date().toISOString(),
    });
  }

  return {
    metrics,
    behavioral_patterns: legacyBehavioral,
    network_analysis: legacyNetwork,
    anomalies,
  };
}
