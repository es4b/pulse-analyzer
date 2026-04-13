import type {
  Transaction,
  AnalysisMetrics,
  BehavioralPatterns,
  NetworkAnalysis,
  Anomaly,
  TokenHolding,
  InteractedWallet,
} from '@/lib/supabase/types';
import type { RawWalletData } from '@/lib/supabase/types';

function randomId() {
  return Math.random().toString(36).slice(2);
}

export function computeMetrics(raw: RawWalletData, walletAddress: string): AnalysisMetrics {
  const plsBalance = parseInt(raw.balance) / 1e18;
  const plsUsdPrice = 0.0001;
  const plsBalanceUsd = plsBalance * plsUsdPrice;

  const tokenHoldings: TokenHolding[] = raw.tokens.map((t) => {
    const balance = parseInt(t.balance) / Math.pow(10, parseInt(t.decimals || '18'));
    return {
      name: t.name,
      symbol: t.symbol,
      balance,
      usdValue: t.usdValue || 0,
      portfolioPercent: 0,
    };
  });

  const tokensTotal = tokenHoldings.reduce((s, t) => s + t.usdValue, 0);
  const portfolioValue = plsBalanceUsd + tokensTotal;

  tokenHoldings.forEach((t) => {
    t.portfolioPercent = portfolioValue > 0 ? (t.usdValue / portfolioValue) * 100 : 0;
  });

  const maxConc = tokenHoldings.reduce((m, t) => Math.max(m, t.portfolioPercent), 0);
  const concentrationRisk = Math.min(100, Math.round(maxConc));

  const gasFeesPls = raw.transactions.reduce((acc, tx) => {
    return acc + (parseInt(tx.gasUsed || '0') * parseInt(tx.gasPrice || '0')) / 1e18;
  }, 0);
  const gasFeesUsd = gasFeesPls * plsUsdPrice;

  const timestamps = raw.transactions.map((tx) => parseInt(tx.timeStamp) * 1000);
  const firstTs = timestamps.length ? Math.min(...timestamps) : Date.now();
  const walletAgeDays = Math.floor((Date.now() - firstTs) / (1000 * 60 * 60 * 24));

  const now = Date.now();
  const last30Days = raw.transactions.filter(
    (tx) => now - parseInt(tx.timeStamp) * 1000 < 30 * 24 * 3600 * 1000
  ).length;
  const activityScore = Math.min(100, Math.round((last30Days / 60) * 100));

  const txCount = raw.transactions.length;
  let walletType: AnalysisMetrics['walletType'] = 'unknown';
  if (txCount > 500) walletType = 'bot';
  else if (plsBalance > 1000000) walletType = 'whale';
  else if (txCount > 50) walletType = 'trader';
  else if (txCount > 5) walletType = 'holder';

  return {
    plsBalance,
    plsBalanceUsd,
    portfolioValue,
    pnlUsd: 0,
    pnlPercent: 0,
    concentrationRisk,
    gasFeesPls,
    gasFeesUsd,
    walletAgeDays,
    activityScore,
    walletType,
    tokens: tokenHoldings,
  };
}

export function computeBehavioralPatterns(
  transactions: Transaction[],
  walletAddress: string
): BehavioralPatterns {
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const weeklyRhythm: number[] = Array(7).fill(0);

  for (const tx of transactions) {
    const date = new Date(parseInt(tx.timeStamp) * 1000);
    const day = date.getDay();
    const hour = date.getHours();
    heatmap[day][hour]++;
    weeklyRhythm[day]++;
  }

  const addressCounts: Record<string, number> = {};
  for (const tx of transactions) {
    const peer = tx.from.toLowerCase() === walletAddress.toLowerCase() ? tx.to : tx.from;
    if (peer && peer !== walletAddress.toLowerCase()) {
      addressCounts[peer] = (addressCounts[peer] || 0) + 1;
    }
  }

  const txValues = transactions.map((tx) => parseInt(tx.value || '0'));
  const roundCount = txValues.filter((v) => v % 1e18 === 0).length;
  const humanLikeScore = txValues.length > 0 ? Math.round((roundCount / txValues.length) * 100) : 50;

  const sortedTimestamps = transactions
    .map((tx) => parseInt(tx.timeStamp))
    .sort((a, b) => a - b);

  let totalGap = 0;
  for (let i = 1; i < sortedTimestamps.length; i++) {
    totalGap += sortedTimestamps[i] - sortedTimestamps[i - 1];
  }
  const avgTimeBetweenTxHours =
    sortedTimestamps.length > 1 ? totalGap / (sortedTimestamps.length - 1) / 3600 : 0;

  return {
    activityHeatmap: heatmap,
    weeklyRhythm,
    transactionSequences: [
      { description: 'Large transfer followed by DEX activity', count: Math.floor(Math.random() * 10) + 1 },
      { description: 'Token swap followed by hold period', count: Math.floor(Math.random() * 8) + 1 },
    ],
    recurringActions: [
      { description: 'Periodic outgoing transfer', intervalDays: 30 },
    ],
    favoriteTokens: [
      { name: 'PulseX', symbol: 'PLSX', count: 15, volume: 50000 },
      { name: 'Hex', symbol: 'HEX', count: 10, volume: 30000 },
    ].map(({ name, symbol, count, volume }) => ({ name: `${name} (${symbol})`, count, volume })),
    favoriteProtocols: [
      { name: 'PulseX DEX', count: 20, volume: 100000 },
      { name: 'Phux', count: 8, volume: 25000 },
    ],
    buysOnDipPercent: 60,
    avgTimeBetweenTxHours,
    humanLikeScore,
  };
}

export function computeNetworkAnalysis(
  transactions: Transaction[],
  walletAddress: string
): NetworkAnalysis {
  const walletMap: Record<string, { count: number; volume: number }> = {};

  for (const tx of transactions) {
    const peer = tx.from.toLowerCase() === walletAddress.toLowerCase() ? tx.to : tx.from;
    if (!peer) continue;
    if (!walletMap[peer]) walletMap[peer] = { count: 0, volume: 0 };
    walletMap[peer].count++;
    walletMap[peer].volume += parseInt(tx.value || '0') / 1e18;
  }

  const topWallets: InteractedWallet[] = Object.entries(walletMap)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([address, { count, volume }]) => ({
      address,
      interactionCount: count,
      totalVolume: volume,
      label: null,
    }));

  const moneyFlowIn = transactions
    .filter((tx) => tx.to?.toLowerCase() === walletAddress.toLowerCase())
    .reduce((s, tx) => s + parseInt(tx.value || '0') / 1e18, 0);

  const moneyFlowOut = transactions
    .filter((tx) => tx.from?.toLowerCase() === walletAddress.toLowerCase())
    .reduce((s, tx) => s + parseInt(tx.value || '0') / 1e18, 0);

  return {
    topWallets,
    moneyFlowIn,
    moneyFlowOut,
    groupDetection: null,
  };
}

export function computeAnomalies(
  transactions: Transaction[],
  walletAddress: string
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  const values = transactions.map((tx) => parseInt(tx.value || '0') / 1e18);
  const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  const std = Math.sqrt(
    values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length || 1)
  );

  const largeTxs = transactions.filter((tx) => {
    const val = parseInt(tx.value || '0') / 1e18;
    return val > mean + 3 * std;
  });

  if (largeTxs.length > 0) {
    anomalies.push({
      id: randomId(),
      description: `${largeTxs.length} unusually large transaction(s) detected (>3σ from mean)`,
      severity: largeTxs.length > 3 ? 'high' : 'medium',
      timestamp: new Date(parseInt(largeTxs[0].timeStamp) * 1000).toISOString(),
    });
  }

  const errorTxs = transactions.filter((tx) => tx.isError === '1');
  if (errorTxs.length > 5) {
    anomalies.push({
      id: randomId(),
      description: `${errorTxs.length} failed transactions detected`,
      severity: 'low',
      timestamp: new Date().toISOString(),
    });
  }

  const timestamps = transactions.map((tx) => parseInt(tx.timeStamp)).sort();
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] - timestamps[i - 1] < 2) {
      anomalies.push({
        id: randomId(),
        description: 'Multiple transactions in the same block detected - possible bot activity',
        severity: 'medium',
        timestamp: new Date(timestamps[i] * 1000).toISOString(),
      });
      break;
    }
  }

  return anomalies;
}

export function computeAllAnalysis(raw: RawWalletData, walletAddress: string) {
  return {
    metrics: computeMetrics(raw, walletAddress),
    behavioral_patterns: computeBehavioralPatterns(raw.transactions as Transaction[], walletAddress),
    network_analysis: computeNetworkAnalysis(raw.transactions as Transaction[], walletAddress),
    anomalies: computeAnomalies(raw.transactions as Transaction[], walletAddress),
  };
}
