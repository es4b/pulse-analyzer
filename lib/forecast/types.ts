// Public types for the forecast engine.

export type MarketPhase = 'bull' | 'bear' | 'neutral';
export type WalletPhase = 'high_activity' | 'low_activity' | 'dormant';
export type TxSizeBucket = 'small' | 'medium' | 'large';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type Timeframe = '1h' | '24h' | '48h' | '7d';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ScenarioTrigger {
  type: string;
  description: string;
  strength: number; // 0-1
  lastOccurrence: string; // ISO date
  timeSinceTriggerHours: number;
}

export interface ScenarioContext {
  marketPhase: MarketPhase;
  walletPhase: WalletPhase;
  txSizeBucket: TxSizeBucket;
  timeOfDay: TimeOfDay;
  dayOfWeek: string;
}

export interface TimeDistribution {
  lessThan1h: number;
  h1to6: number;
  h6to24: number;
  d1to7: number;
  moreThan7d: number;
}

export interface OutcomeDetail {
  description: string;
  avgSizePls: number;
  commonDestinations: string[];
}

export interface ScenarioOutcome {
  action: string;
  probability: number;
  baselineProbability: number;
  edge: number;
  avgTimeToEventHours: number;
  medianTimeHours: number;
  timeDistribution: TimeDistribution;
  detail: OutcomeDetail;
  isNegative: boolean;
}

export interface DecayByTimeframe {
  h1: number;
  h24: number;
  h48: number;
  d7: number;
}

export interface ScenarioResult {
  id: string;
  name: string;
  triggered: boolean;
  hypotheticalDescription: string;
  trigger: ScenarioTrigger;
  context: ScenarioContext;
  outcomes: ScenarioOutcome[];
  sequenceChain: string[];
  sampleSize: number;
  reliabilityFactor: number;
  baseConfidence: number;
  confidence: number;
  priorityScore: number;
  decayByTimeframe: DecayByTimeframe;
  isHighConviction: boolean;
  highConvictionReason: string | null;
}

export interface CurrentState {
  activeScenarios: ScenarioResult[];
  dominantScenario: ScenarioResult | null;
  isHighConviction: boolean;
  currentWalletPhase: WalletPhase;
  currentMarketPhase: MarketPhase;
  lastTxHoursAgo: number;
  isRevengeAlert: boolean;
  regimeShift: boolean;
  warnings: string[];
  lowClarity: boolean;
}

export interface AiForecastSummary {
  mostLikelyAction: string;
  timeframe: string;
  riskLevel: RiskLevel;
  keyPatterns: string[];
  contradictions: string[];
  negativeSignals: string[];
  watchPoints: string[];
  confidence: number;
  summary: { en: string; lt: string };
}

export interface ForecastResponse {
  walletId: string;
  timeframe: Timeframe;
  activeScenarios: ScenarioResult[];
  dominantScenario: ScenarioResult | null;
  isHighConviction: boolean;
  isRevengeAlert: boolean;
  regimeShift: boolean;
  lowClarity: boolean;
  warnings: string[];
  aiSummary: AiForecastSummary | null;
  computedAt: string;
  baselines: Record<string, number>;
}

export interface Baselines {
  large_incoming_transfer: number;
  large_outgoing_transfer: number;
  dex_contract_call: number;
  token_purchase: number;
  inactivity_period: number;
  contract_interaction: number;
  wallet_to_wallet_transfer: number;
}
