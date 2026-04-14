'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SkeletonDashboardPage } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Badge } from '@/components/ui/Badge';
import type { AnalysisResult, Anomaly, Wallet } from '@/lib/types';
import type { ForecastResponse } from '@/lib/forecast/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtUsd(n: number | null | undefined): string {
  const v = n ?? 0;
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  return (n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pnlColor(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v > 0) return '#22C55E';
  if (v < 0) return '#EF4444';
  return '#1D1D1F';
}

function timeAgo(dateStr: string | null | undefined, locale: string): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  const lt = locale === 'lt';
  if (min < 1) return lt ? 'Ką tik' : 'Just now';
  if (min < 60) return lt ? `prieš ${min} min.` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return lt ? `prieš ${hr} val.` : `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return lt ? `prieš ${d} d.` : `${d}d ago`;
}

function firstTxDate(walletAgeDays: number | undefined, locale: string): string {
  if (!walletAgeDays || walletAgeDays <= 0) return '—';
  const d = new Date(Date.now() - walletAgeDays * 86_400_000);
  return d.toLocaleDateString(locale === 'lt' ? 'lt-LT' : 'en-US');
}

const TOKEN_COLORS = ['#1D1D1F', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#7C3AED', '#86868B'];

// ─── Card primitives ─────────────────────────────────────────────────────────

function Card({
  title, action, children, padding = 'p-6',
}: { title?: string; action?: React.ReactNode; children: React.ReactNode; padding?: string }) {
  return (
    <div className={`border border-[#E5E5E5] rounded-xl ${padding} bg-white`}>
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

function KpiCard({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border border-[#E5E5E5] rounded-xl p-5 bg-white">
      <p className="text-xs text-[#86868B] mb-2">{label}</p>
      <p className="text-2xl font-semibold leading-none" style={{ color: color ?? '#1D1D1F' }}>
        {value}
      </p>
      {sub && <p className="text-xs text-[#86868B] mt-2">{sub}</p>}
    </div>
  );
}

function ScoreChip({
  label, score, inverted, tooltip,
}: { label: string; score: number; inverted?: boolean; tooltip: string }) {
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

function ProbBar({
  label, value, color = '#3B82F6',
}: { label: string; value: number; color?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-[#1D1D1F]">{label}</span>
        <span className="text-sm font-medium text-[#1D1D1F]">{pct}%</span>
      </div>
      <div className="h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ─── AddWalletForm (preserved) ───────────────────────────────────────────────

function AddWalletForm({ onAdded }: { onAdded: (wallet: Wallet) => void }) {
  const t = useTranslations('dashboard');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, label }),
      });
      const data = await res.json() as { wallet?: Wallet; error?: string };
      if (!res.ok) {
        setError(data.error || t('fetchError'));
      } else if (data.wallet) {
        onAdded(data.wallet);
      }
    } catch {
      setError(t('fetchError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <h2 className="text-lg font-semibold text-[#1D1D1F] mb-2">{t('addWallet')}</h2>
        <p className="text-sm text-[#86868B] mb-6">{t('noWalletDesc')}</p>
        {error && (
          <div className="mb-4 p-3 bg-[#EF4444]/5 border border-[#EF4444]/20 rounded-lg">
            <p className="text-sm text-[#EF4444]">{error}</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-[#86868B] mb-1.5">{t('walletAddress')}</label>
            <input
              type="text" value={address} onChange={(e) => setAddress(e.target.value)}
              placeholder={t('walletAddressPlaceholder')}
              className="w-full px-3 py-2.5 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#1D1D1F] transition-colors font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[#86868B] mb-1.5">{t('walletLabel')}</label>
            <input
              type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={t('walletLabelPlaceholder')}
              className="w-full px-3 py-2.5 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#1D1D1F] transition-colors"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-[#1D1D1F] text-white text-sm font-medium rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? t('refreshing') : t('addWalletButton')}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tAnalysis = useTranslations('analysis');
  const tForecast = useTranslations('forecast');
  const locale = useLocale();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [wRes, aRes, fRes] = await Promise.all([
        fetch('/api/wallet'),
        fetch('/api/analysis'),
        fetch('/api/forecast'),
      ]);
      const wData = await wRes.json() as { wallet?: Wallet | null };
      const aData = await aRes.json() as { analysis?: AnalysisResult | null };
      const fData = await fRes.json() as { forecast?: ForecastResponse | null };
      setWallet(wData.wallet ?? null);
      setAnalysis(aData.analysis ?? null);
      setForecast(fData.forecast ?? null);
    } catch {
      setError(t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetch(`/api/wallet/refresh?locale=${locale}`, { method: 'POST' });
      await loadAll();
    } finally {
      setIsRefreshing(false);
    }
  }, [locale, loadAll]);

  if (loading) {
    return (
      <DashboardLayout>
        <SkeletonDashboardPage />
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <ErrorState message={error} onRetry={loadAll} />
      </DashboardLayout>
    );
  }

  if (!wallet) {
    return (
      <DashboardLayout>
        <AddWalletForm onAdded={(w) => { setWallet(w); loadAll(); }} />
      </DashboardLayout>
    );
  }

  // Wallet exists but no analysis yet — wallet was just added, or analysis pending
  if (!analysis) {
    return (
      <DashboardLayout wallet={wallet} lastUpdated={wallet.last_updated} onRefresh={handleRefresh} isRefreshing={isRefreshing}>
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-[#1D1D1F]">{t('wallet')}</h1>
            <p className="text-sm text-[#86868B] mt-1 font-mono break-all">{wallet.address}</p>
          </div>
          <Card>
            <p className="text-sm text-[#1D1D1F] mb-4">{t('noAnalysisYet')}</p>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-4 py-2 bg-[#1D1D1F] text-white text-sm font-medium rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              {isRefreshing ? t('refreshing') : t('refresh')}
            </button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const m = analysis.metrics;

  return (
    <DashboardLayout wallet={wallet} lastUpdated={wallet.last_updated} onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        {/* Heading */}
        <div>
          <h1 className="text-xl font-semibold text-[#1D1D1F]">{t('title')}</h1>
          <p className="text-xs text-[#86868B] mt-1 font-mono break-all">{wallet.address}</p>
        </div>

        {/* SECTION 1: KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label={t('kpiPlsBalance')}
            value={fmtNum(m.portfolio.plsBalance, 0)}
            sub={fmtUsd(m.portfolio.plsBalanceUsd)}
          />
          <KpiCard
            label={t('kpiPortfolioValue')}
            value={fmtUsd(m.portfolio.portfolioValue)}
            sub={`${m.portfolio.tokens.length} ${t('kpiTokens')}`}
          />
          <KpiCard
            label={t('kpiWalletAge')}
            value={`${m.walletAgeDays} ${tAnalysis('days')}`}
            sub={`${t('kpiSince')} ${firstTxDate(m.walletAgeDays, locale)}`}
          />
          <KpiCard
            label={t('kpiLastActivity')}
            value={timeAgo(wallet.last_updated, locale)}
            sub={`${m.transactionCount.toLocaleString()} ${t('kpiTransactions')}`}
          />
        </div>

        {/* SECTION 2: Meta Scores */}
        <Card>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-[#1D1D1F]">{t('metaScoresTitle')}</h3>
              <p className="text-xs text-[#86868B] mt-1">{t('metaScoresSubtitle')}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-3">
              <ScoreChip label={tAnalysis('skillScore')} score={m.metaScores.skillScore} tooltip={tAnalysis('skillScoreTooltip')} />
              <ScoreChip label={tAnalysis('riskScore')} score={m.metaScores.riskScore} inverted tooltip={tAnalysis('riskScoreTooltip')} />
              <ScoreChip label={tAnalysis('behaviorScore')} score={m.metaScores.behaviorScore} tooltip={tAnalysis('behaviorScoreTooltip')} />
              <ScoreChip label={tAnalysis('alphaScore')} score={m.metaScores.alphaScore} tooltip={tAnalysis('alphaScoreTooltip')} />
            </div>
          </div>
        </Card>

        {/* SECTION 3: Two columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-6">
            <Card title={t('profileTitle')}>
              <div className="flex flex-col items-start gap-3">
                <Badge variant="default">
                  <span className="text-base">{m.profileLabel}</span>
                </Badge>
                <p className="text-sm text-[#86868B] leading-relaxed">
                  {t(`profileDesc_${profileKey(m.profileLabel)}`)}
                </p>
              </div>
            </Card>

            <Card title={t('performanceTitle')}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-[#86868B] mb-1">{tAnalysis('winRate')}</p>
                  <p className="text-xl font-semibold text-[#1D1D1F]">{m.performance.winRate}%</p>
                </div>
                <div>
                  <p className="text-xs text-[#86868B] mb-1">{tAnalysis('expectancy')}</p>
                  <p className="text-xl font-semibold" style={{ color: pnlColor(m.performance.expectancy) }}>
                    {fmtUsd(m.performance.expectancy)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#86868B] mb-1">{tAnalysis('maxDrawdown')}</p>
                  <p className="text-xl font-semibold text-[#EF4444]">{fmtUsd(m.performance.maxDrawdownUsd)}</p>
                </div>
                <div>
                  <p className="text-xs text-[#86868B] mb-1">{tAnalysis('tradeCount')}</p>
                  <p className="text-xl font-semibold text-[#1D1D1F]">{m.performance.tradeCount}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <Card title={tAnalysis('weeklyRhythm')}>
              <WeeklyActivityChart weeklyRhythm={analysis.behavioral_patterns.weeklyRhythm} locale={locale} />
            </Card>

            <Card title={t('tokenDistribution')}>
              <TokenDistributionChart tokens={m.portfolio.tokens} t={t} />
            </Card>
          </div>
        </div>

        {/* SECTION 4: Forecast snapshot */}
        {forecast && forecast.dominantScenario && (
          <Card
            title={t('forecastSnapshotTitle')}
            action={
              <Link href={`/${locale}/dashboard/forecast`} className="text-xs text-[#3B82F6] hover:underline">
                {t('viewForecast')} →
              </Link>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-[#86868B] mb-1">{tForecast('mostLikelyAction')}</p>
                <p className="text-xl font-semibold text-[#1D1D1F] mb-2">
                  {forecast.aiSummary?.mostLikelyAction || forecast.dominantScenario.name}
                </p>
                <p className="text-xs text-[#86868B] mb-4">{forecast.dominantScenario.trigger.description}</p>
                <div className="flex items-center gap-3">
                  <Badge variant={forecast.isRevengeAlert ? 'error' : forecast.isHighConviction ? 'warning' : 'default'}>
                    {forecast.dominantScenario.name}
                  </Badge>
                  <span className="text-xs text-[#86868B]">
                    {tForecast('confidence')}: <b className="text-[#1D1D1F]">{forecast.dominantScenario.confidence}%</b>
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs text-[#86868B] uppercase tracking-wider">{tForecast('outcomes')}</p>
                {forecast.dominantScenario.outcomes.slice(0, 2).map((o) => (
                  <ProbBar
                    key={o.action}
                    label={o.detail.description}
                    value={o.probability}
                    color={o.edge > 0 ? '#22C55E' : '#3B82F6'}
                  />
                ))}
              </div>
            </div>
          </Card>
        )}

        {!forecast && (
          <Card title={t('forecastSnapshotTitle')}>
            <p className="text-sm text-[#86868B]">{tForecast('pressRefresh')}</p>
          </Card>
        )}

        {/* SECTION 5: Anomalies */}
        {analysis.anomalies && analysis.anomalies.length > 0 && (
          <Card
            title={t('anomaliesTitle')}
            action={
              <Link href={`/${locale}/dashboard/analysis`} className="text-xs text-[#3B82F6] hover:underline">
                {t('viewAll')} →
              </Link>
            }
          >
            <div className="space-y-3">
              {analysis.anomalies.slice(0, 3).map((a) => (
                <AnomalyRow key={a.id} anomaly={a} locale={locale} />
              ))}
            </div>
          </Card>
        )}

        {/* SECTION 6: Last updated + Refresh */}
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-[#86868B] mb-1">{t('lastUpdated')}</p>
              <p className="text-sm text-[#1D1D1F]">
                {wallet.last_updated
                  ? `${new Date(wallet.last_updated).toLocaleString(locale === 'lt' ? 'lt-LT' : 'en-US')} · ${timeAgo(wallet.last_updated, locale)}`
                  : '—'}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-4 py-2 bg-[#1D1D1F] text-white text-sm font-medium rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={isRefreshing ? 'animate-spin' : ''}>
                <path d="M10 6A4 4 0 112 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10 3v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {isRefreshing ? t('refreshing') : t('refresh')}
            </button>
          </div>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function profileKey(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '_');
}

function WeeklyActivityChart({ weeklyRhythm, locale }: { weeklyRhythm: number[]; locale: string }) {
  const days = locale === 'lt'
    ? ['Sk', 'Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const data = (weeklyRhythm ?? []).map((count, i) => ({ day: days[i], count }));
  if (data.every((d) => d.count === 0)) {
    return <p className="text-sm text-[#86868B]">No activity data yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data}>
        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#86868B' }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#86868B' }} />
        <Tooltip contentStyle={{ border: '1px solid #E5E5E5', borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#F5F5F7' }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill="#1D1D1F" />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

type T = ReturnType<typeof useTranslations>;

function TokenDistributionChart({
  tokens,
  t,
}: {
  tokens: Array<{ name: string; symbol: string; balance: number; usdValue: number; portfolioPercent: number }>;
  t: T;
}) {
  const sorted = [...tokens].filter((tk) => tk.usdValue > 0).sort((a, b) => b.usdValue - a.usdValue);
  if (sorted.length === 0) {
    return <p className="text-sm text-[#86868B]">{t('noTokenData')}</p>;
  }
  const top5 = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const othersValue = rest.reduce((s, tk) => s + tk.usdValue, 0);
  const pieData = [
    ...top5.map((tk) => ({ name: tk.symbol, value: tk.usdValue })),
    ...(othersValue > 0 ? [{ name: t('othersLabel'), value: othersValue }] : []),
  ];
  const total = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col md:flex-row items-center gap-4">
      <div className="w-40 h-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} dataKey="value" innerRadius={40} outerRadius={70} paddingAngle={2} stroke="none">
              {pieData.map((_, i) => <Cell key={i} fill={TOKEN_COLORS[i % TOKEN_COLORS.length]} />)}
            </Pie>
            <Tooltip
              formatter={(v) => `$${Number(Array.isArray(v) ? v[0] : v ?? 0).toFixed(2)}`}
              contentStyle={{ border: '1px solid #E5E5E5', borderRadius: 8, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 w-full space-y-1.5">
        {pieData.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: TOKEN_COLORS[i % TOKEN_COLORS.length] }}
              />
              <span className="text-[#1D1D1F] truncate">{d.name}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[#86868B]">{total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : '—'}</span>
              <span className="text-[#1D1D1F]">{fmtUsd(d.value)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnomalyRow({ anomaly, locale }: { anomaly: Anomaly; locale: string }) {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    critical: { bg: 'bg-[#7C3AED]/5', border: 'border-[#7C3AED]', text: 'text-[#7C3AED]' },
    high: { bg: 'bg-[#EF4444]/5', border: 'border-[#EF4444]', text: 'text-[#EF4444]' },
    medium: { bg: 'bg-[#F59E0B]/5', border: 'border-[#F59E0B]', text: 'text-[#D97706]' },
    low: { bg: 'bg-[#F5F5F7]', border: 'border-[#86868B]', text: 'text-[#86868B]' },
  };
  const c = colors[anomaly.severity] ?? colors.low;
  return (
    <div className={`${c.bg} rounded-lg p-3 border-l-4 ${c.border}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[#1D1D1F] flex-1">{anomaly.description}</p>
        <span className={`text-xs font-medium uppercase ${c.text} shrink-0`}>{anomaly.severity}</span>
      </div>
      <p className="text-xs text-[#86868B] mt-1">
        {new Date(anomaly.timestamp).toLocaleString(locale === 'lt' ? 'lt-LT' : 'en-US')}
      </p>
    </div>
  );
}
