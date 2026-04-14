'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line,
} from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SkeletonForecastPage } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import type { ForecastResponse, Timeframe, ScenarioResult } from '@/lib/forecast/types';
import type { Wallet } from '@/lib/types';

const TIMEFRAMES: Timeframe[] = ['1h', '24h', '48h', '7d'];

function Card({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-[#E5E5E5] rounded-xl p-6">
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="text-sm font-medium text-[#1D1D1F]">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Chip({ label, tone = 'gray' }: { label: string; tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue' }) {
  const colors: Record<string, string> = {
    gray: 'bg-[#F5F5F7] text-[#1D1D1F]',
    green: 'bg-[#22C55E]/10 text-[#16A34A]',
    red: 'bg-[#EF4444]/10 text-[#DC2626]',
    amber: 'bg-[#F59E0B]/10 text-[#D97706]',
    blue: 'bg-[#3B82F6]/10 text-[#2563EB]',
  };
  return (
    <span className={`px-2 py-1 rounded text-xs font-mono ${colors[tone]}`}>
      {label}
    </span>
  );
}

function SequenceChain({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <Chip label={step} tone="blue" />
          {i < steps.length - 1 && <span className="text-[#86868B]">→</span>}
        </div>
      ))}
    </div>
  );
}

function ConfidenceBar({ value, color }: { value: number; color?: string }) {
  const c = color ?? (value < 33 ? '#EF4444' : value < 66 ? '#F59E0B' : '#22C55E');
  return (
    <div className="h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: c }} />
    </div>
  );
}

function OutcomeBar({
  action, probability, baseline, edge, isNegative, description,
}: {
  action: string;
  probability: number;
  baseline: number;
  edge: number;
  isNegative: boolean;
  description: string;
}) {
  const pct = Math.round(probability * 100);
  const basePct = Math.round(baseline * 100);
  const edgePct = Math.round(edge * 100);
  const positive = edge > 0;
  const color = isNegative ? '#86868B' : positive ? '#22C55E' : '#EF4444';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <p className="text-sm text-[#1D1D1F] font-medium">{description}</p>
          <p className="text-xs text-[#86868B]">{action}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-[#1D1D1F]">{pct}%</p>
          <p className="text-xs" style={{ color }}>
            base {basePct}% · edge {edgePct > 0 ? '+' : ''}{edgePct}%
          </p>
        </div>
      </div>
      <div className="relative h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
        <div className="absolute h-full bg-[#86868B]/40" style={{ width: `${basePct}%` }} />
        <div className="absolute h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function ForecastPage() {
  const t = useTranslations('forecast');
  const locale = useLocale();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('24h');
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const [walletRes, forecastRes] = await Promise.all([
        fetch('/api/wallet'),
        fetch(`/api/forecast?timeframe=${tf}&locale=${locale}`),
      ]);
      const walletData = await walletRes.json() as { wallet?: Wallet | null };
      const forecastData = await forecastRes.json() as {
        forecast?: ForecastResponse | null;
        hasForecast?: boolean;
        error?: string;
      };
      setWallet(walletData.wallet ?? null);
      if (!forecastRes.ok) {
        setError(forecastData.error ?? t('error'));
      } else {
        // 200 OK with forecast: null means "no forecast generated yet" — not an error.
        setForecast(forecastData.forecast ?? null);
      }
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [locale, t]);

  useEffect(() => { load(timeframe); }, [load, timeframe]);

  if (loading) {
    return (
      <DashboardLayout wallet={wallet}>
        <SkeletonForecastPage />
      </DashboardLayout>
    );
  }

  if (error) {
    return <DashboardLayout wallet={wallet}><ErrorState message={error} onRetry={() => load(timeframe)} /></DashboardLayout>;
  }

  if (!forecast) {
    return (
      <DashboardLayout wallet={wallet}>
        <EmptyState title={t('noForecastTitle')} description={t('pressRefresh')} />
      </DashboardLayout>
    );
  }

  const active = forecast.activeScenarios;
  const dominant = forecast.dominantScenario;
  const triggered = active.filter((s) => s.triggered);
  const hypothetical = active.filter((s) => !s.triggered);

  return (
    <DashboardLayout wallet={wallet}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-xl font-semibold text-[#1D1D1F]">{t('title')}</h1>
          <div className="flex gap-1 border border-[#E5E5E5] rounded-lg p-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  timeframe === tf ? 'bg-[#1D1D1F] text-white' : 'text-[#86868B] hover:text-[#1D1D1F]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {forecast.isRevengeAlert && (
          <div className="bg-[#EF4444]/10 border-2 border-[#EF4444]/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#EF4444] flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1L15 14H1L8 1z" stroke="white" strokeWidth="2" />
                  <path d="M8 6v3M8 11h.01" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-[#DC2626] mb-1">{t('revengeAlertTitle')}</p>
                <p className="text-sm text-[#1D1D1F]">{t('revengeAlertMessage')}</p>
              </div>
            </div>
          </div>
        )}

        {forecast.isHighConviction && !forecast.isRevengeAlert && (
          <div className="bg-[#F59E0B]/10 border-2 border-[#F59E0B]/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#F59E0B] flex items-center justify-center shrink-0 text-white font-bold">!</div>
              <div>
                <p className="font-semibold text-[#D97706] mb-1">{t('highConvictionTitle')}</p>
                <p className="text-sm text-[#1D1D1F]">
                  {dominant?.highConvictionReason ?? t('highConvictionDefault')}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Chip label={`${t('marketPhase')}: ${forecast.dominantScenario?.context.marketPhase ?? 'n/a'}`} tone="blue" />
          <Chip label={`${t('walletPhase')}: ${forecast.dominantScenario?.context.walletPhase ?? 'n/a'}`} tone="gray" />
          <Chip label={`${t('timeOfDay')}: ${forecast.dominantScenario?.context.timeOfDay ?? 'n/a'}`} tone="gray" />
          <Chip label={`${t('dayOfWeek')}: ${forecast.dominantScenario?.context.dayOfWeek ?? 'n/a'}`} tone="gray" />
          {forecast.regimeShift && <Chip label={t('regimeShift')} tone="amber" />}
          {forecast.lowClarity && <Chip label={t('lowClarity')} tone="red" />}
        </div>

        {forecast.warnings && forecast.warnings.length > 0 && (
          <div className="bg-[#F59E0B]/5 border border-[#F59E0B]/20 rounded-xl p-4">
            <p className="text-xs font-medium text-[#D97706] uppercase tracking-wider mb-2">{t('warnings')}</p>
            <ul className="space-y-1">
              {forecast.warnings.map((w, i) => (
                <li key={i} className="text-sm text-[#1D1D1F]">• {w}</li>
              ))}
            </ul>
          </div>
        )}

        {dominant && <DecayChart scenario={dominant} t={t} />}

        {triggered.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-[#1D1D1F] uppercase tracking-wider">{t('activeSignals')}</h2>
            {triggered.map((s) => (
              <ScenarioCard key={s.id} scenario={s} t={t} />
            ))}
          </div>
        )}

        {hypothetical.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-[#1D1D1F] uppercase tracking-wider">{t('hypotheticalScenarios')}</h2>
            {hypothetical.map((s) => (
              <ScenarioCard key={s.id} scenario={s} t={t} />
            ))}
          </div>
        )}

        {forecast.aiSummary && <AiSummaryCard summary={forecast.aiSummary} locale={locale} t={t} />}
      </motion.div>
    </DashboardLayout>
  );
}

type T = ReturnType<typeof useTranslations>;

function ScenarioCard({ scenario, t }: { scenario: ScenarioResult; t: T }) {
  const isTriggered = scenario.triggered;
  const hasData = scenario.sampleSize > 0;
  return (
    <Card>
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-base font-semibold text-[#1D1D1F]">{scenario.name}</h3>
            {isTriggered
              ? <Badge variant="success">{t('activeSignal')}</Badge>
              : <Badge variant="gray">{t('hypotheticalScenario')}</Badge>
            }
            {scenario.isHighConviction && <Badge variant="warning">{t('highConvictionBadge')}</Badge>}
          </div>
          <p className="text-sm text-[#86868B]">{scenario.trigger.description}</p>
          <p className="text-sm text-[#1D1D1F] mt-2 italic">{scenario.hypotheticalDescription}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[#86868B] mb-1">{t('confidence')}</p>
          <p className="text-2xl font-semibold text-[#1D1D1F]">{scenario.confidence}%</p>
        </div>
      </div>

      <div className="mb-4">
        <ConfidenceBar value={scenario.confidence} />
      </div>

      <div className="flex items-center gap-3 mb-4 text-xs text-[#86868B] flex-wrap">
        <span>{t('sampleSize')}: <b className="text-[#1D1D1F]">{scenario.sampleSize}</b></span>
        <span>·</span>
        <span>{t('reliability')}: <b className="text-[#1D1D1F]">{Math.round(scenario.reliabilityFactor * 100)}%</b></span>
        {isTriggered && <>
          <span>·</span>
          <span>{t('priority')}: <b className="text-[#1D1D1F]">{Math.round(scenario.priorityScore * 100)}</b></span>
        </>}
        {scenario.trigger.timeSinceTriggerHours >= 0 && <>
          <span>·</span>
          <span>{isTriggered ? t('triggeredAgo') : t('lastEvent')}: <b className="text-[#1D1D1F]">{scenario.trigger.timeSinceTriggerHours >= 24 ? `${(scenario.trigger.timeSinceTriggerHours / 24).toFixed(1)}d` : `${scenario.trigger.timeSinceTriggerHours.toFixed(1)}h`}</b></span>
        </>}
      </div>

      {!hasData && (
        <div className="bg-[#F5F5F7] rounded-lg p-3 mb-4 text-xs text-[#86868B]">
          {t('noHistoricalData')}
        </div>
      )}

      <div className="space-y-4 mb-4">
        <h4 className="text-xs font-medium text-[#86868B] uppercase tracking-wider">{t('outcomes')}</h4>
        {scenario.outcomes.filter((o) => !o.isNegative).map((o) => (
          <div key={o.action}>
            <OutcomeBar
              action={o.action}
              probability={o.probability}
              baseline={o.baselineProbability}
              edge={o.edge}
              isNegative={o.isNegative}
              description={o.detail.description}
            />
            {o.avgTimeToEventHours > 0 && (
              <p className="text-xs text-[#86868B] mt-1">
                {t('expectedWithin')}: {o.avgTimeToEventHours.toFixed(1)}h ({t('median')}: {o.medianTimeHours.toFixed(1)}h)
              </p>
            )}
          </div>
        ))}
      </div>

      {scenario.outcomes.some((o) => o.isNegative) && (
        <div className="space-y-2 mb-4">
          <h4 className="text-xs font-medium text-[#86868B] uppercase tracking-wider">{t('unlikely')}</h4>
          {scenario.outcomes.filter((o) => o.isNegative).map((o) => (
            <div key={o.action} className="flex items-center justify-between text-sm">
              <span className="text-[#86868B]">{o.detail.description}</span>
              <span className="text-[#86868B]">{Math.round(o.probability * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      {scenario.sequenceChain.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-[#86868B] uppercase tracking-wider mb-2">{t('sequenceChain')}</h4>
          <SequenceChain steps={scenario.sequenceChain} />
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-[#86868B] flex-wrap">
        <span>{t('lastOccurrence')}: {new Date(scenario.trigger.lastOccurrence).toLocaleString()}</span>
      </div>
    </Card>
  );
}

function DecayChart({ scenario, t }: { scenario: ScenarioResult; t: T }) {
  const data = [
    { tf: '1h', value: scenario.decayByTimeframe.h1 },
    { tf: '24h', value: scenario.decayByTimeframe.h24 },
    { tf: '48h', value: scenario.decayByTimeframe.h48 },
    { tf: '7d', value: scenario.decayByTimeframe.d7 },
  ];
  return (
    <Card title={t('decayTitle')} action={<span className="text-xs text-[#86868B]">{scenario.name}</span>}>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data}>
          <XAxis dataKey="tf" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#86868B' }} />
          <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#86868B' }} />
          <Tooltip contentStyle={{ border: '1px solid #E5E5E5', borderRadius: 8, fontSize: 12 }} formatter={(v) => `${v}%`} />
          <Line type="monotone" dataKey="value" stroke="#1D1D1F" strokeWidth={2} dot={{ r: 4, fill: '#1D1D1F' }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

function AiSummaryCard({ summary, locale, t }: { summary: NonNullable<ForecastResponse['aiSummary']>; locale: string; t: T }) {
  const riskColor: Record<string, string> = {
    low: '#22C55E',
    medium: '#F59E0B',
    high: '#EF4444',
    critical: '#7C3AED',
  };
  const summaryText = locale === 'lt' ? summary.summary.lt : summary.summary.en;
  return (
    <Card title={t('aiSummary')}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#86868B] mb-1">{t('mostLikelyAction')}</p>
          <p className="text-xl font-semibold text-[#1D1D1F]">{summary.mostLikelyAction}</p>
        </div>
        <div>
          <p className="text-xs text-[#86868B] mb-1">{t('riskLevel')}</p>
          <Badge variant={summary.riskLevel === 'critical' || summary.riskLevel === 'high' ? 'error' : summary.riskLevel === 'medium' ? 'warning' : 'success'}>
            <span style={{ color: riskColor[summary.riskLevel] }}>{summary.riskLevel.toUpperCase()}</span>
          </Badge>
        </div>
      </div>

      <p className="text-sm text-[#1D1D1F] mb-4">{summaryText}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summary.keyPatterns.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-[#86868B] uppercase tracking-wider mb-2">{t('keyPatterns')}</h4>
            <ul className="space-y-1">
              {summary.keyPatterns.map((p, i) => (
                <li key={i} className="text-sm text-[#1D1D1F] flex gap-2"><span className="text-[#3B82F6]">•</span>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {summary.watchPoints.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-[#86868B] uppercase tracking-wider mb-2">{t('watchPoints')}</h4>
            <ul className="space-y-1">
              {summary.watchPoints.map((p, i) => (
                <li key={i} className="text-sm text-[#1D1D1F] flex gap-2"><span className="text-[#F59E0B]">•</span>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {summary.contradictions.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-[#86868B] uppercase tracking-wider mb-2">{t('contradictions')}</h4>
            <ul className="space-y-1">
              {summary.contradictions.map((p, i) => (
                <li key={i} className="text-sm text-[#1D1D1F] flex gap-2"><span className="text-[#7C3AED]">•</span>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {summary.negativeSignals.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-[#86868B] uppercase tracking-wider mb-2">{t('negativeSignals')}</h4>
            <ul className="space-y-1">
              {summary.negativeSignals.map((p, i) => (
                <li key={i} className="text-sm text-[#86868B] flex gap-2"><span>•</span>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-[#E5E5E5]">
        <p className="text-xs text-[#86868B]">{t('aiConfidence')}: {summary.confidence}%</p>
      </div>
    </Card>
  );
}

function BaselineView({ forecast, t }: { forecast: ForecastResponse; t: T }) {
  const baselines = forecast.baselines;
  const entries = Object.entries(baselines)
    .map(([action, pct]) => ({ action, pct: Math.round((pct as number) * 100) }))
    .sort((a, b) => b.pct - a.pct);
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#3B82F6]/10 flex items-center justify-center text-[#3B82F6] text-sm">i</div>
          <div>
            <p className="font-medium text-[#1D1D1F]">{t('baselineTitle')}</p>
            <p className="text-sm text-[#86868B]">{t('baselineMessage')}</p>
          </div>
        </div>
      </Card>

      <Card title={t('baselineBehaviorTable')}>
        <ResponsiveContainer width="100%" height={Math.max(200, entries.length * 36)}>
          <BarChart data={entries} layout="vertical" margin={{ left: 100 }}>
            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#86868B' }} />
            <YAxis dataKey="action" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#86868B' }} width={160} />
            <Tooltip formatter={(v) => `${v}%`} contentStyle={{ border: '1px solid #E5E5E5', borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
              {entries.map((_, i) => <Cell key={i} fill="#1D1D1F" />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {forecast.dominantScenario && (
        <Card title={t('activityByHour')}>
          <p className="text-xs text-[#86868B] mb-3">{forecast.dominantScenario.trigger.description}</p>
          <div className="space-y-2">
            {forecast.dominantScenario.outcomes.map((o) => (
              <OutcomeBar
                key={o.action}
                action={o.action}
                probability={o.probability}
                baseline={o.baselineProbability}
                edge={o.edge}
                isNegative={o.isNegative}
                description={o.detail.description}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
