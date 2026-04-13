export interface User {
  id: string;
  email: string;
  telegram_chat_id: string | null;
  viber_user_id: string | null;
  notify_email: boolean;
  notify_telegram: boolean;
  notify_viber: boolean;
  large_tx_threshold: number;
  created_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  address: string;
  label: string | null;
  last_updated: string | null;
  created_at: string;
}

export interface WalletData {
  id: string;
  wallet_id: string;
  raw_data: RawWalletData;
  analyzed_at: string;
}

export interface RawWalletData {
  balance: string;
  tokens: Token[];
  transactions: Transaction[];
  internalTransactions: InternalTransaction[];
}

export interface Token {
  contractAddress: string;
  name: string;
  symbol: string;
  balance: string;
  decimals: string;
  usdValue?: number;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  timeStamp: string;
  isError: string;
  input: string;
  blockNumber: string;
}

export interface InternalTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  type: string;
}

export interface AnalysisResult {
  id: string;
  wallet_id: string;
  metrics: AnalysisMetrics;
  behavioral_patterns: BehavioralPatterns;
  network_analysis: NetworkAnalysis;
  anomalies: Anomaly[];
  created_at: string;
}

export interface AnalysisMetrics {
  plsBalance: number;
  plsBalanceUsd: number;
  portfolioValue: number;
  pnlUsd: number;
  pnlPercent: number;
  concentrationRisk: number;
  gasFeesPls: number;
  gasFeesUsd: number;
  walletAgeDays: number;
  activityScore: number;
  walletType: 'trader' | 'holder' | 'whale' | 'bot' | 'unknown';
  tokens: TokenHolding[];
}

export interface TokenHolding {
  name: string;
  symbol: string;
  balance: number;
  usdValue: number;
  portfolioPercent: number;
}

export interface BehavioralPatterns {
  activityHeatmap: number[][];
  weeklyRhythm: number[];
  transactionSequences: PatternDetection[];
  recurringActions: RecurringAction[];
  favoriteTokens: FavoriteItem[];
  favoriteProtocols: FavoriteItem[];
  buysOnDipPercent: number;
  avgTimeBetweenTxHours: number;
  humanLikeScore: number;
}

export interface PatternDetection {
  description: string;
  count: number;
}

export interface RecurringAction {
  description: string;
  intervalDays: number;
}

export interface FavoriteItem {
  name: string;
  count: number;
  volume: number;
}

export interface NetworkAnalysis {
  topWallets: InteractedWallet[];
  moneyFlowIn: number;
  moneyFlowOut: number;
  groupDetection: string | null;
}

export interface InteractedWallet {
  address: string;
  interactionCount: number;
  totalVolume: number;
  label: 'exchange' | 'whale' | 'contract' | 'blacklisted' | null;
}

export interface Anomaly {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
}

export interface ForecastResult {
  id: string;
  wallet_id: string;
  timeframe: string;
  probability: number;
  prediction: ForecastPrediction;
  confidence: number;
  created_at: string;
}

export interface ForecastPrediction {
  probabilities: {
    buyPls: number;
    moveToDex: number;
    transferOut: number;
    hold: number;
    other: number;
  };
  patternMatch: string;
  riskWarnings: string[];
  interpretation: string;
  confidence: number;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  message: string;
  sent_at: string;
  channel: string;
}
