'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SkeletonAnalysisPage } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import type { AnalysisResult, Wallet, AiInsightsData } from '@/lib/types';

type ActiveTab =
  | 'overview'
  | 'performance'
  | 'psychology'
  | 'strategy'
  | 'bot'
  | 'behavior'
  | 'network'
  | 'token'
  | 'risk'
  | 'ai';

// ─── Small UI primitives ────────────────────────────────────────────────────

function Metric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="border border-[#E5E5E5] rounded-xl p-5">
      <p className="text-xs text-[#86868B] mb-2">{label}</p>
      <p
        className="text-2xl font-semibold leading-none"
        style={{ color: color ?? '#1D1D1F' }}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-[#86868B] mt-1">{sub}</p>}
    </div>
  );
}

function ScoreBar({ score, label, color }: { score: number; label?: string; color?: string }) {
  const c = color ?? (score < 33 ? '#22C55E' : score < 66 ? '#F59E0B' : '#EF4444');
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-[#86868B]">{label}</span>
          <span className="text-xs font-medium text-[#1D1D1F]">{score}/100</span>
        </div>
      )}
      <div className="h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: c }} />
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#E5E5E5] rounded-xl p-6">
      <h3 className="text-sm font-medium text-[#1D1D1F] mb-4">{title}</h3>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | number | React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#E5E5E5] last:border-0">
      <span className="text-xs text-[#86868B]">{label}</span>
      <span className="text-sm text-[#1D1D1F]">{value}</span>
    </div>
  );
}

function fmtUsd(n: number | null | undefined): string {
  const v = n ?? 0;
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtPct(n: number | null | undefined): string {
  return `${(n ?? 0).toFixed(1)}%`;
}

function pnlColor(n: number): string {
  if (n > 0) return '#22C55E';
  if (n < 0) return '#EF4444';
  return '#1D1D1F';
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ActivityHeatmap({ data }: { data: number[][] }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.flat(), 1);
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {DAYS.map((day, d) => (
          <div key={day} className="flex flex-col gap-1">
            <span className="text-xs text-[#86868B] mb-1 w-8 text-center">{day}</span>
            {(data[d] || []).map((val, h) => {
              const opacity = max > 0 ? val / max : 0;
              return (
                <div
                  key={h}
                  title={`${day} ${h}:00 — ${val} txs`}
                  className="w-8 h-2 rounded-sm"
                  style={{ backgroundColor: `rgba(29,29,31,${opacity > 0 ? Math.max(0.05, opacity) : 0})` }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const t = useTranslations('analysis');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  const load = useCallback(async () => {
    try {
      const [walletRes, analysisRes] = await Promise.all([
        fetch('/api/wallet'),
        fetch('/api/analysis'),
      ]);
      const walletData = await walletRes.json() as { wallet?: Wallet | null };
      const analysisData = await analysisRes.json() as { analysis?: AnalysisResult | null };
      setWallet(walletData.wallet ?? null);
      setAnalysis(analysisData.analysis ?? null);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <DashboardLayout wallet={wallet}>
        <SkeletonAnalysisPage />
      </DashboardLayout>
    );
  }

  if (error) {
    return <DashboardLayout wallet={wallet}><ErrorState message={error} onRetry={load} /></DashboardLayout>;
  }

  if (!analysis) {
    return (
      <DashboardLayout wallet={wallet}>
        <EmptyState title={t('noData')} description={t('noDataDesc')} />
      </DashboardLayout>
    );
  }

  const m = analysis.metrics;
  const ai = analysis.ai_insights;

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'overview', label: t('overview') },
    { key: 'performance', label: t('performance') },
    { key: 'psychology', label: t('psychology') },
    { key: 'strategy', label: t('strategy') },
    { key: 'bot', label: t('bot') },
    { key: 'behavior', label: t('behaviorTab') },
    { key: 'network', label: t('network') },
    { key: 'token', label: t('token') },
    { key: 'risk', label: t('risk') },
    { key: 'ai', label: t('aiInsights') },
  ];

  return (
    <DashboardLayout wallet={wallet}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        {/* Header with profile label + meta scores */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-[#1D1D1F]">{t('title')}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="default">{m.profileLabel}</Badge>
              <span className="text-xs text-[#86868B]">
                {m.transactionCount} txs · {m.walletAgeDays} {t('days')}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-3">
              <ScoreChip label={t('skillScore')} score={m.metaScores.skillScore} tooltip={t('skillScoreTooltip')} />
              <ScoreChip label={t('riskScore')} score={m.metaScores.riskScore} inverted tooltip={t('riskScoreTooltip')} />
              <ScoreChip label={t('behaviorScore')} score={m.metaScores.behaviorScore} tooltip={t('behaviorScoreTooltip')} />
              <ScoreChip label={t('alphaScore')} score={m.metaScores.alphaScore} tooltip={t('alphaScoreTooltip')} />
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[#86868B] flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
                {t('legendGood')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                {t('legendAverage')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
                {t('legendAttention')}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border border-[#E5E5E5] rounded-lg p-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                activeTab === tab.key ? 'bg-[#1D1D1F] text-white' : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && <OverviewTab m={m} t={t} />}
        {activeTab === 'performance' && <PerformanceTab m={m} t={t} />}
        {activeTab === 'psychology' && <PsychologyTab m={m} t={t} />}
        {activeTab === 'strategy' && <StrategyTab m={m} t={t} />}
        {activeTab === 'bot' && <BotTab m={m} t={t} />}
        {activeTab === 'behavior' && <BehaviorTab m={m} t={t} />}
        {activeTab === 'network' && <NetworkTab m={m} t={t} />}
        {activeTab === 'token' && <TokenTab m={m} t={t} />}
        {activeTab === 'risk' && <RiskTab m={m} t={t} />}
        {activeTab === 'ai' && <AiInsightsTab insights={ai} t={t} />}
      </motion.div>
    </DashboardLayout>
  );
}

function ScoreChip({
  label,
  score,
  inverted,
  tooltip,
}: {
  label: string;
  score: number;
  inverted?: boolean;
  tooltip: string;
}) {
  const val = inverted ? 100 - score : score;
  const color = val < 40 ? '#EF4444' : val <= 60 ? '#F59E0B' : '#22C55E';
  return (
    <div className="text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-white text-sm font-semibold mx-auto mb-1"
        style={{ backgroundColor: color }}
      >
        {score}
      </div>
      <div className="relative inline-flex items-center justify-center gap-1 group">
        <p className="text-xs text-[#86868B]">{label}</p>
        <span
          className="w-3.5 h-3.5 rounded-full bg-[#E5E5E5] text-[9px] text-[#86868B] flex items-center justify-center cursor-help peer font-medium"
          aria-label={tooltip}
        >
          ?
        </span>
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 rounded-lg bg-[#1D1D1F] text-white text-xs leading-snug shadow-lg opacity-0 peer-hover:opacity-100 group-hover:opacity-100 transition-opacity z-50"
        >
          {tooltip}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-[#1D1D1F] rotate-45" />
        </div>
      </div>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type T = ReturnType<typeof useTranslations>;

function OverviewTab({ m, t }: { m: AnalysisResult['metrics']; t: T }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric
          label={t('plsBalance')}
          value={m.portfolio.plsBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          sub={fmtUsd(m.portfolio.plsBalanceUsd)}
        />
        <Metric label={t('portfolioValue')} value={fmtUsd(m.portfolio.portfolioValue)} />
        <Metric
          label={t('totalPnl')}
          value={fmtUsd(m.performance.totalPnlUsd)}
          sub={fmtPct(m.performance.roiPercent) + ' ROI'}
          color={pnlColor(m.performance.totalPnlUsd)}
        />
        <Metric
          label={t('gasFees')}
          value={`${(m.portfolio.gasFeesPls ?? 0).toFixed(2)} PLS`}
          sub={fmtUsd(m.portfolio.gasFeesUsd)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={t('portfolioBreakdown')}>
          {m.portfolio.tokens.length === 0 ? (
            <p className="text-sm text-[#86868B]">{t('noTokens')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E5E5]">
                  <th className="text-left py-2 text-xs text-[#86868B] font-medium">{t('token')}</th>
                  <th className="text-right py-2 text-xs text-[#86868B] font-medium">{t('value')}</th>
                  <th className="text-right py-2 text-xs text-[#86868B] font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {[...m.portfolio.tokens]
                  .sort((a, b) => b.usdValue - a.usdValue)
                  .slice(0, 10)
                  .map((tk, i) => (
                    <tr key={i} className="border-b border-[#E5E5E5] last:border-0">
                      <td className="py-2 text-[#1D1D1F]">{tk.symbol}</td>
                      <td className="py-2 text-right text-[#1D1D1F]">{fmtUsd(tk.usdValue)}</td>
                      <td className="py-2 text-right text-[#86868B]">{(tk.portfolioPercent ?? 0).toFixed(1)}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={t('keyMetrics')}>
          <KV label={t('walletType')} value={<Badge variant="gray">{t(m.walletType)}</Badge>} />
          <KV label={t('profileLabel')} value={m.profileLabel} />
          <KV label={t('tradingStyle')} value={m.strategy.tradingStyle} />
          <KV label={t('walletAge')} value={`${m.walletAgeDays} ${t('days')}`} />
          <KV label={t('activityScore')} value={`${m.activityScore}/100`} />
          <KV label={t('tradesPerWeek')} value={(m.behavior.tradesPerWeek ?? 0).toFixed(1)} />
        </Card>
      </div>
    </div>
  );
}

function PerformanceTab({ m, t }: { m: AnalysisResult['metrics']; t: T }) {
  const p = m.performance;
  const r = m.risk;
  const trendVariant: 'success' | 'error' | 'gray' =
    p.performanceTrend === 'improving' ? 'success' : p.performanceTrend === 'declining' ? 'error' : 'gray';
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label={t('realizedPnl')} value={fmtUsd(p.realizedPnlUsd)} color={pnlColor(p.realizedPnlUsd)} />
        <Metric label={t('unrealizedPnl')} value={fmtUsd(p.unrealizedPnlUsd)} color={pnlColor(p.unrealizedPnlUsd)} />
        <Metric label={t('totalPnl')} value={fmtUsd(p.totalPnlUsd)} color={pnlColor(p.totalPnlUsd)} sub={fmtPct(p.roiPercent) + ' ROI'} />
        <Metric label={t('tradeCount')} value={p.tradeCount} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label={t('winRate')} value={`${p.winRate}%`} color="#22C55E" />
        <Metric label={t('lossRate')} value={`${p.lossRate}%`} color="#EF4444" />
        <Metric label={t('avgProfit')} value={fmtUsd(p.avgProfitUsd)} color="#22C55E" />
        <Metric label={t('avgLoss')} value={fmtUsd(p.avgLossUsd)} color="#EF4444" />
      </div>

      <Card title={t('performanceTrend')}>
        <div className="flex items-center gap-3">
          <Badge variant={trendVariant}>{t(`trend_${p.performanceTrend}`)}</Badge>
          <p className="text-xs text-[#86868B]">{t('performanceTrendDesc')}</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title={t('entryQuality')}>
          <p className="text-3xl font-semibold text-[#1D1D1F] mb-2">{p.entryQualityScore}<span className="text-base text-[#86868B]">/100</span></p>
          <ScoreBar score={p.entryQualityScore} color="#22C55E" />
          <p className="text-xs text-[#86868B] mt-3">{t('entryQualityDesc')}</p>
        </Card>
        <Card title={t('exitQuality')}>
          <p className="text-3xl font-semibold text-[#1D1D1F] mb-2">{p.exitQualityScore}<span className="text-base text-[#86868B]">/100</span></p>
          <ScoreBar score={p.exitQualityScore} color="#3B82F6" />
          <p className="text-xs text-[#86868B] mt-3">{t('exitQualityDesc')}</p>
        </Card>
        <Card title={t('missedProfit')}>
          <p className="text-3xl font-semibold mb-2" style={{ color: p.missedProfitPct > 10 ? '#EF4444' : '#1D1D1F' }}>
            {(p.missedProfitPct ?? 0).toFixed(1)}%
          </p>
          <p className="text-xs text-[#86868B]">{t('missedProfitDesc')}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={t('tailRisk')}>
          <p className="text-3xl font-semibold mb-2" style={{ color: r.tailRiskScore > 30 ? '#EF4444' : '#1D1D1F' }}>
            {r.tailRiskScore}<span className="text-base text-[#86868B]">/100</span>
          </p>
          <ScoreBar score={r.tailRiskScore} color="#EF4444" />
          <p className="text-xs text-[#86868B] mt-3">{t('tailRiskDesc')}</p>
        </Card>
        <Card title={t('liquidityRisk')}>
          <p className="text-3xl font-semibold mb-2" style={{ color: r.liquidityRiskScore > 50 ? '#EF4444' : '#1D1D1F' }}>
            {r.liquidityRiskScore}<span className="text-base text-[#86868B]">/100</span>
          </p>
          <ScoreBar score={r.liquidityRiskScore} color="#F59E0B" />
          <p className="text-xs text-[#86868B] mt-3">{t('liquidityRiskDesc')}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={t('expectancy')}>
          <p className="text-2xl font-semibold mb-2" style={{ color: pnlColor(p.expectancy) }}>
            {fmtUsd(p.expectancy)}
          </p>
          <p className="text-xs text-[#86868B]">{t('expectancyDesc')}</p>
          <div className="mt-4 space-y-2">
            <KV label={t('longestWinStreak')} value={p.longestWinStreak} />
            <KV label={t('longestLossStreak')} value={p.longestLossStreak} />
            <KV label={t('pnlStdDev')} value={fmtUsd(p.pnlStdDev)} />
          </div>
        </Card>

        <Card title={t('drawdown')}>
          <div className="space-y-2">
            <KV label={t('maxDrawdown')} value={fmtUsd(p.maxDrawdownUsd)} />
            <KV label={t('avgDrawdown')} value={fmtUsd(p.avgDrawdownUsd)} />
            <KV label={t('totalInflow')} value={fmtUsd(p.totalInflowUsd)} />
            <KV label={t('totalOutflow')} value={fmtUsd(p.totalOutflowUsd)} />
            <KV label={t('netFlow')} value={<span style={{ color: pnlColor(p.netFlowUsd) }}>{fmtUsd(p.netFlowUsd)}</span>} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function PsychologyTab({ m, t }: { m: AnalysisResult['metrics']; t: T }) {
  const p = m.psychology;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label={t('avgHoldingTime')} value={`${(p.avgHoldingHours ?? 0).toFixed(1)}h`} />
        <Metric label={t('medianHoldingTime')} value={`${(p.medianHoldingHours ?? 0).toFixed(1)}h`} />
        <Metric label={t('paperVsDiamond')} value={`${p.paperVsDiamondIndex}/100`} sub={p.paperVsDiamondIndex > 60 ? t('diamond') : p.paperVsDiamondIndex < 40 ? t('paper') : t('mixed')} />
        <Metric label={t('impatienceScore')} value={`${p.impatienceScore}%`} color={p.impatienceScore > 30 ? '#EF4444' : '#1D1D1F'} />
      </div>

      <Card title={t('emotionalIndicators')}>
        <div className="space-y-4">
          <ScoreBar score={p.fomoScore} label={t('fomoScore')} color="#EF4444" />
          <ScoreBar score={p.dipBuyScore} label={t('dipBuyScore')} color="#22C55E" />
          <ScoreBar score={p.revengeScore} label={t('revengeScore')} color="#F59E0B" />
          <ScoreBar score={p.impatienceScore} label={t('impatienceScore')} color="#EF4444" />
        </div>
        <p className="text-xs text-[#86868B] mt-4">{t('psychologyDesc')}</p>
      </Card>
    </div>
  );
}

function StrategyTab({ m, t }: { m: AnalysisResult['metrics']; t: T }) {
  const s = m.strategy;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label={t('tradingStyle')} value={s.tradingStyle} />
        <Metric label={t('positionSizing')} value={s.positionSizing} />
        <Metric label={t('entryStyle')} value={s.entryStyle} />
        <Metric label={t('exitStyle')} value={s.exitStyle} />
      </div>

      <Card title={t('dcaDetection')}>
        <ScoreBar score={s.dcaScore} label={t('dcaScore')} color="#3B82F6" />
        <p className="text-xs text-[#86868B] mt-3">{t('dcaScoreDesc')}</p>
      </Card>
    </div>
  );
}

function BotTab({ m, t }: { m: AnalysisResult['metrics']; t: T }) {
  const b = m.bot;
  const isBot = b.botProbability > 70;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={t('botProbability')}>
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-lg font-semibold"
              style={{ backgroundColor: isBot ? '#EF4444' : '#22C55E' }}
            >
              {b.botProbability}%
            </div>
            <div>
              <p className="text-sm font-medium text-[#1D1D1F]">
                {isBot ? t('likelyBot') : t('likelyHuman')}
              </p>
              <p className="text-xs text-[#86868B]">{t('aiConfidence')}: {b.botConfidence}%</p>
            </div>
          </div>
          <ScoreBar score={b.botProbability} color={isBot ? '#EF4444' : '#22C55E'} />
        </Card>

        <Card title={t('signalBreakdown')}>
          <div className="space-y-3">
            <ScoreBar score={b.preciseAmountsPct} label={t('preciseAmounts')} />
            <ScoreBar score={b.timingRegularityScore} label={t('timingRegularity')} />
            <ScoreBar score={b.repeatedPatternScore} label={t('repeatedPatterns')} />
            <ScoreBar score={b.gasConsistencyScore} label={t('gasConsistency')} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function BehaviorTab({ m, t }: { m: AnalysisResult['metrics']; t: T }) {
  const b = m.behavior;
  const weeklyData = b.weekdayPattern.map((count, i) => ({ day: DAYS[i], count }));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label={t('tradesPerDay')} value={(b.tradesPerDay ?? 0).toFixed(2)} />
        <Metric label={t('tradesPerWeek')} value={(b.tradesPerWeek ?? 0).toFixed(1)} />
        <Metric label={t('burstCount')} value={b.burstCount} />
        <Metric label={t('avgBurstSize')} value={(b.avgBurstSize ?? 0).toFixed(1)} />
      </div>

      <Card title={t('activityHeatmap')}>
        <ActivityHeatmap data={b.activityHeatmap} />
        <p className="text-xs text-[#86868B] mt-2">{t('heatmapDesc')}</p>
      </Card>

      <Card title={t('weeklyRhythm')}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={weeklyData}>
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#86868B' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#86868B' }} />
            <Tooltip contentStyle={{ border: '1px solid #E5E5E5', borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {weeklyData.map((_, i) => <Cell key={i} fill="#1D1D1F" />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function NetworkTab({ m, t }: { m: AnalysisResult['metrics']; t: T }) {
  const n = m.network;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label={t('uniqueCounterparties')} value={n.uniqueCounterpartiesCount} />
        <Metric label={t('contractInteractions')} value={`${n.contractInteractionPct}%`} />
        <Metric label={t('circularFlow')} value={`${n.circularFlowScore}%`} color={n.circularFlowScore > 30 ? '#EF4444' : '#1D1D1F'} />
        <Metric label={t('netFlow')} value={fmtUsd(n.moneyFlowInUsd - n.moneyFlowOutUsd)} color={pnlColor(n.moneyFlowInUsd - n.moneyFlowOutUsd)} />
      </div>

      <Card title={t('topCounterparties')}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E5E5]">
              <th className="text-left py-2 text-xs text-[#86868B] font-medium">{t('address')}</th>
              <th className="text-left py-2 text-xs text-[#86868B] font-medium">{t('type')}</th>
              <th className="text-right py-2 text-xs text-[#86868B] font-medium">{t('interactions')}</th>
              <th className="text-right py-2 text-xs text-[#86868B] font-medium">{t('volume')}</th>
            </tr>
          </thead>
          <tbody>
            {n.topCounterparties.map((c, i) => (
              <tr key={i} className="border-b border-[#E5E5E5] last:border-0">
                <td className="py-2 font-mono text-xs text-[#1D1D1F]">{c.address.slice(0, 8)}…{c.address.slice(-6)}</td>
                <td className="py-2"><Badge variant={c.isContract ? 'default' : 'gray'}>{c.isContract ? t('contract') : 'EOA'}</Badge></td>
                <td className="py-2 text-right text-[#1D1D1F]">{c.count}</td>
                <td className="py-2 text-right text-[#1D1D1F]">{fmtUsd(c.volumeUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TokenTab({ m, t }: { m: AnalysisResult['metrics']; t: T }) {
  const tk = m.token;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label={t('tokenDiversity')} value={tk.tokenDiversityCount} />
        <Metric label={t('tokenEntropy')} value={`${tk.tokenEntropyScore}/100`} sub={t('entropyDesc')} />
        <Metric label={t('deadTokens')} value={`${tk.deadTokensPct}%`} color={tk.deadTokensPct > 50 ? '#EF4444' : '#1D1D1F'} />
        <Metric label={t('earlyEntry')} value={`${tk.earlyEntryScore}/100`} />
      </div>

      <Card title={t('allHoldings')}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E5E5]">
              <th className="text-left py-2 text-xs text-[#86868B] font-medium">{t('token')}</th>
              <th className="text-left py-2 text-xs text-[#86868B] font-medium">{t('symbol')}</th>
              <th className="text-right py-2 text-xs text-[#86868B] font-medium">{t('balance')}</th>
              <th className="text-right py-2 text-xs text-[#86868B] font-medium">{t('value')}</th>
              <th className="text-right py-2 text-xs text-[#86868B] font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {[...m.portfolio.tokens]
              .sort((a, b) => b.usdValue - a.usdValue)
              .map((tok, i) => (
                <tr key={i} className="border-b border-[#E5E5E5] last:border-0">
                  <td className="py-2 text-[#1D1D1F]">{tok.name}</td>
                  <td className="py-2 text-[#86868B]">{tok.symbol}</td>
                  <td className="py-2 text-right text-[#1D1D1F]">{(tok.balance ?? 0).toFixed(4)}</td>
                  <td className="py-2 text-right text-[#1D1D1F]">{fmtUsd(tok.usdValue)}</td>
                  <td className="py-2 text-right text-[#86868B]">{(tok.portfolioPercent ?? 0).toFixed(2)}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function RiskTab({ m, t }: { m: AnalysisResult['metrics']; t: T }) {
  const r = m.risk;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label={t('concentrationRisk')} value={`${r.concentrationRisk}/100`} color={r.concentrationRisk > 66 ? '#EF4444' : r.concentrationRisk > 33 ? '#F59E0B' : '#22C55E'} />
        <Metric label={t('largeTransactions')} value={r.largeTransactionsCount} />
        <Metric label={t('failedTxPct')} value={`${r.failedTransactionsPct}%`} color={r.failedTransactionsPct > 10 ? '#EF4444' : '#1D1D1F'} />
        <Metric label={t('moneyLaunderingRisk')} value={`${r.moneyLaunderingRisk}/100`} color={r.moneyLaunderingRisk > 66 ? '#EF4444' : r.moneyLaunderingRisk > 33 ? '#F59E0B' : '#22C55E'} />
      </div>

      <Card title={t('riskBreakdown')}>
        <div className="space-y-4">
          <ScoreBar score={r.concentrationRisk} label={t('concentrationRisk')} />
          <ScoreBar score={r.moneyLaunderingRisk} label={t('moneyLaunderingRisk')} />
          <ScoreBar score={r.failedTransactionsPct} label={t('failedTxPct')} />
        </div>
      </Card>
    </div>
  );
}

function AiInsightsTab({ insights, t }: { insights: AiInsightsData | null; t: T }) {
  if (!insights) {
    return <EmptyState title={t('aiNoData')} description={t('aiNoDataDesc')} />;
  }
  const confidencePct = Math.round(insights.confidence * 100);
  return (
    <div className="space-y-6">
      <Card title={t('aiSummary')}>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-[#86868B] mb-1">English</p>
            <p className="text-sm text-[#1D1D1F]">{insights.summary.en}</p>
          </div>
          <div>
            <p className="text-xs text-[#86868B] mb-1">Lietuviškai</p>
            <p className="text-sm text-[#1D1D1F]">{insights.summary.lt}</p>
          </div>
        </div>
      </Card>

      <Card title={t('aiStrategyType')}>
        <p className="text-sm text-[#1D1D1F] mb-3">{insights.strategyType}</p>
        <ScoreBar score={confidencePct} label={t('aiConfidence')} />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {insights.strengths.length > 0 && (
          <Card title={t('aiStrengths')}>
            <ul className="space-y-2">
              {insights.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#22C55E] shrink-0" />
                  <span className="text-sm text-[#1D1D1F]">{s}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {insights.weaknesses.length > 0 && (
          <Card title={t('aiWeaknesses')}>
            <ul className="space-y-2">
              {insights.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#F59E0B] shrink-0" />
                  <span className="text-sm text-[#1D1D1F]">{w}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {insights.risks.length > 0 && (
        <Card title={t('aiRisks')}>
          <ul className="space-y-2">
            {insights.risks.map((r, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#EF4444] shrink-0" />
                <span className="text-sm text-[#1D1D1F]">{r}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {insights.contradictions.length > 0 && (
        <Card title={t('aiContradictions')}>
          <ul className="space-y-2">
            {insights.contradictions.map((c, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#7C3AED] shrink-0" />
                <span className="text-sm text-[#1D1D1F]">{c}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
