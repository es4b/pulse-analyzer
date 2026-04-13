'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import type { AnalysisResult, Wallet, Anomaly } from '@/lib/supabase/types';

type SeverityFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';
type ActiveTab = 'portfolio' | 'behavioral' | 'network' | 'anomalies';

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-[#E5E5E5] rounded-xl p-5">
      <p className="text-xs text-[#86868B] mb-2">{label}</p>
      <p className="text-2xl font-semibold text-[#1D1D1F] leading-none">{value}</p>
      {sub && <p className="text-xs text-[#86868B] mt-1">{sub}</p>}
    </div>
  );
}

function RiskBar({ score, label }: { score: number; label: string }) {
  const color = score < 33 ? '#22C55E' : score < 66 ? '#F59E0B' : '#EF4444';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-[#86868B]">{label}</span>
        <span className="text-xs font-medium text-[#1D1D1F]">{score}/100</span>
      </div>
      <div className="h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ActivityHeatmap({ data }: { data: number[][] }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.flat());

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

const SEVERITY_COLORS: Record<string, string> = {
  low: '#86868B',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#7C3AED',
};

export default function AnalysisPage() {
  const t = useTranslations('analysis');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('portfolio');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [sortKey, setSortKey] = useState<'name' | 'value' | 'portfolioPercent'>('value');

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

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'portfolio', label: t('portfolio') },
    { key: 'behavioral', label: t('behavioral') },
    { key: 'network', label: t('network') },
    { key: 'anomalies', label: t('anomalies') },
  ];

  if (loading) {
    return (
      <DashboardLayout wallet={wallet}>
        <div className="space-y-6">
          <Skeleton className="h-8 w-32" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout wallet={wallet}>
        <ErrorState message={error} onRetry={load} retryLabel={t('retry')} />
      </DashboardLayout>
    );
  }

  if (!analysis) {
    return (
      <DashboardLayout wallet={wallet}>
        <EmptyState title={t('noData')} description={t('noDataDesc')} />
      </DashboardLayout>
    );
  }

  const { metrics, behavioral_patterns, network_analysis, anomalies } = analysis;

  const walletTypeBadge: Record<string, 'success' | 'warning' | 'error' | 'gray' | 'default'> = {
    trader: 'warning',
    holder: 'success',
    whale: 'default',
    bot: 'error',
    unknown: 'gray',
  };

  const filteredAnomalies: Anomaly[] = (anomalies || []).filter(
    (a) => severityFilter === 'all' || a.severity === severityFilter
  );

  const sortedTokens = [...(metrics?.tokens || [])].sort((a, b) => {
    if (sortKey === 'name') return a.name.localeCompare(b.name);
    if (sortKey === 'value') return b.usdValue - a.usdValue;
    return b.portfolioPercent - a.portfolioPercent;
  });

  const weeklyData = (behavioral_patterns?.weeklyRhythm || []).map((count, i) => ({
    day: DAYS[i],
    count,
  }));

  const topWallets = network_analysis?.topWallets || [];

  return (
    <DashboardLayout wallet={wallet}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <h1 className="text-xl font-semibold text-[#1D1D1F]">{t('title')}</h1>

        <div className="flex gap-1 border border-[#E5E5E5] rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === tab.key
                  ? 'bg-[#1D1D1F] text-white'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'portfolio' && metrics && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                label={t('plsBalance')}
                value={metrics.plsBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                sub={`$${metrics.plsBalanceUsd.toFixed(2)}`}
              />
              <MetricCard
                label={t('portfolioValue')}
                value={`$${metrics.portfolioValue.toFixed(2)}`}
              />
              <MetricCard
                label={t('gasFees')}
                value={`${metrics.gasFeesPls.toFixed(4)} PLS`}
                sub={`$${metrics.gasFeesUsd.toFixed(2)}`}
              />
              <MetricCard
                label={t('walletAge')}
                value={metrics.walletAgeDays}
                sub={t('days')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-[#E5E5E5] rounded-xl p-5">
                <p className="text-xs text-[#86868B] mb-3">{t('activityScore')}</p>
                <RiskBar score={metrics.activityScore} label="" />
              </div>
              <div className="border border-[#E5E5E5] rounded-xl p-5">
                <p className="text-xs text-[#86868B] mb-3">{t('concentrationRisk')}</p>
                <RiskBar score={metrics.concentrationRisk} label="" />
              </div>
              <div className="border border-[#E5E5E5] rounded-xl p-5">
                <p className="text-xs text-[#86868B] mb-2">{t('walletType')}</p>
                <Badge variant={walletTypeBadge[metrics.walletType] ?? 'gray'}>
                  {t(metrics.walletType)}
                </Badge>
                <p className="text-xs text-[#86868B] mt-2">{t(`${metrics.walletType}Desc`)}</p>
              </div>
            </div>

            <div className="border border-[#E5E5E5] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E5E5] flex items-center justify-between">
                <h3 className="text-sm font-medium text-[#1D1D1F]">{t('tokens')}</h3>
                <div className="flex gap-2 text-xs text-[#86868B]">
                  {(['name', 'value', 'portfolioPercent'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setSortKey(k)}
                      className={`px-2 py-1 rounded ${sortKey === k ? 'bg-[#F5F5F7] text-[#1D1D1F]' : 'hover:text-[#1D1D1F]'}`}
                    >
                      {k === 'name' ? t('token') : k === 'value' ? t('value') : t('percentage')}
                    </button>
                  ))}
                </div>
              </div>
              {sortedTokens.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[#86868B]">No tokens</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E5E5]">
                      {[t('token'), t('symbol'), t('balance'), t('value'), t('percentage')].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs text-[#86868B] font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTokens.map((token, i) => (
                      <tr key={i} className="border-b border-[#E5E5E5] last:border-0">
                        <td className="px-5 py-3 text-[#1D1D1F]">{token.name}</td>
                        <td className="px-5 py-3 text-[#86868B]">{token.symbol}</td>
                        <td className="px-5 py-3 text-[#1D1D1F]">{token.balance.toFixed(4)}</td>
                        <td className="px-5 py-3 text-[#1D1D1F]">${token.usdValue.toFixed(2)}</td>
                        <td className="px-5 py-3">
                          <span className={token.portfolioPercent > 50 ? 'text-[#EF4444]' : token.portfolioPercent > 25 ? 'text-[#F59E0B]' : 'text-[#22C55E]'}>
                            {token.portfolioPercent.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'behavioral' && behavioral_patterns && (
          <div className="space-y-6">
            <div className="border border-[#E5E5E5] rounded-xl p-6">
              <h3 className="text-sm font-medium text-[#1D1D1F] mb-4">{t('activityHeatmap')}</h3>
              <ActivityHeatmap data={behavioral_patterns.activityHeatmap || []} />
              <p className="text-xs text-[#86868B] mt-2">Hours 0–23 per day of week</p>
            </div>

            <div className="border border-[#E5E5E5] rounded-xl p-6">
              <h3 className="text-sm font-medium text-[#1D1D1F] mb-4">{t('weeklyRhythm')}</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weeklyData}>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#86868B' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#86868B' }} />
                  <Tooltip
                    contentStyle={{ border: '1px solid #E5E5E5', borderRadius: 8, fontSize: 12 }}
                    cursor={{ fill: '#F5F5F7' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {weeklyData.map((_, i) => (
                      <Cell key={i} fill="#1D1D1F" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-[#E5E5E5] rounded-xl p-5">
                <h3 className="text-sm font-medium text-[#1D1D1F] mb-3">{t('transactionSequences')}</h3>
                {(behavioral_patterns.transactionSequences || []).map((seq, i) => (
                  <div key={i} className="flex items-start justify-between py-2 border-b border-[#E5E5E5] last:border-0">
                    <p className="text-sm text-[#86868B] pr-4">{seq.description}</p>
                    <Badge variant="gray">{seq.count}×</Badge>
                  </div>
                ))}
              </div>

              <div className="border border-[#E5E5E5] rounded-xl p-5">
                <h3 className="text-sm font-medium text-[#1D1D1F] mb-3">{t('recurringActions')}</h3>
                {(behavioral_patterns.recurringActions || []).map((action, i) => (
                  <div key={i} className="py-2 border-b border-[#E5E5E5] last:border-0">
                    <p className="text-sm text-[#86868B]">{action.description}</p>
                    <p className="text-xs text-[#86868B] mt-0.5">Every ~{action.intervalDays} days</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-[#E5E5E5] rounded-xl p-5">
                <h3 className="text-sm font-medium text-[#1D1D1F] mb-3">{t('favoriteTokens')}</h3>
                {(behavioral_patterns.favoriteTokens || []).map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-[#E5E5E5] last:border-0">
                    <span className="text-sm text-[#1D1D1F]">{item.name}</span>
                    <span className="text-xs text-[#86868B]">{item.count} txs</span>
                  </div>
                ))}
              </div>

              <div className="border border-[#E5E5E5] rounded-xl p-5">
                <h3 className="text-sm font-medium text-[#1D1D1F] mb-3">{t('favoriteProtocols')}</h3>
                {(behavioral_patterns.favoriteProtocols || []).map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-[#E5E5E5] last:border-0">
                    <span className="text-sm text-[#1D1D1F]">{item.name}</span>
                    <span className="text-xs text-[#86868B]">{item.count} txs</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-[#E5E5E5] rounded-xl p-5">
                <p className="text-xs text-[#86868B] mb-1">{t('marketReaction')}</p>
                <p className="text-sm text-[#1D1D1F]">
                  {t('buysOnDip')}: {behavioral_patterns.buysOnDipPercent}%
                </p>
                <p className="text-sm text-[#86868B]">
                  {t('buysOnPump')}: {100 - behavioral_patterns.buysOnDipPercent}%
                </p>
              </div>
              <div className="border border-[#E5E5E5] rounded-xl p-5">
                <p className="text-xs text-[#86868B] mb-1">{t('avgTimeBetweenTx')}</p>
                <p className="text-sm text-[#1D1D1F]">
                  {behavioral_patterns.avgTimeBetweenTxHours < 24
                    ? `${behavioral_patterns.avgTimeBetweenTxHours.toFixed(1)}h`
                    : `${(behavioral_patterns.avgTimeBetweenTxHours / 24).toFixed(1)}d`}
                </p>
              </div>
              <div className="border border-[#E5E5E5] rounded-xl p-5">
                <p className="text-xs text-[#86868B] mb-1">{t('txSizePattern')}</p>
                <p className="text-sm text-[#1D1D1F]">
                  {behavioral_patterns.humanLikeScore > 50
                    ? `${t('humanLike')} (${t('roundNumbers')}: ${behavioral_patterns.humanLikeScore}%)`
                    : `${t('botLike')} (${t('preciseAmounts')}: ${100 - behavioral_patterns.humanLikeScore}%)`}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'network' && network_analysis && (
          <div className="space-y-6">
            <div className="border border-[#E5E5E5] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E5E5]">
                <h3 className="text-sm font-medium text-[#1D1D1F]">{t('topWallets')}</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E5E5]">
                    <th className="px-5 py-3 text-left text-xs text-[#86868B] font-medium">{t('address')}</th>
                    <th className="px-5 py-3 text-left text-xs text-[#86868B] font-medium">{t('interactions')}</th>
                    <th className="px-5 py-3 text-left text-xs text-[#86868B] font-medium">{t('volume')}</th>
                    <th className="px-5 py-3 text-left text-xs text-[#86868B] font-medium">Label</th>
                  </tr>
                </thead>
                <tbody>
                  {topWallets.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-sm text-[#86868B]">No data</td>
                    </tr>
                  ) : (
                    topWallets.map((w, i) => (
                      <tr key={i} className="border-b border-[#E5E5E5] last:border-0">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-[#1D1D1F]">
                              {w.address.slice(0, 8)}...{w.address.slice(-6)}
                            </span>
                            <button
                              onClick={() => navigator.clipboard.writeText(w.address)}
                              className="text-[#86868B] hover:text-[#1D1D1F]"
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
                                <path d="M2 9H1a1 1 0 01-1-1V2a1 1 0 011-1h6a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.2" />
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-[#1D1D1F]">{w.interactionCount}</td>
                        <td className="px-5 py-3 text-[#1D1D1F]">{w.totalVolume.toFixed(2)} PLS</td>
                        <td className="px-5 py-3">
                          {w.label && (
                            <Badge variant={w.label === 'blacklisted' ? 'error' : w.label === 'exchange' ? 'success' : 'gray'}>
                              {t(w.label)}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-[#E5E5E5] rounded-xl p-5">
                <h3 className="text-sm font-medium text-[#1D1D1F] mb-4">{t('moneyFlow')}</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#86868B]">{t('inflow')}</span>
                      <span className="text-[#22C55E]">{network_analysis.moneyFlowIn.toFixed(2)} PLS</span>
                    </div>
                    <div className="h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
                      <div className="h-full bg-[#22C55E] rounded-full" style={{ width: '60%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#86868B]">{t('outflow')}</span>
                      <span className="text-[#EF4444]">{network_analysis.moneyFlowOut.toFixed(2)} PLS</span>
                    </div>
                    <div className="h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
                      <div className="h-full bg-[#EF4444] rounded-full" style={{ width: '40%' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-[#E5E5E5] rounded-xl p-5">
                <h3 className="text-sm font-medium text-[#1D1D1F] mb-2">{t('groupDetection')}</h3>
                <p className="text-sm text-[#86868B]">
                  {network_analysis.groupDetection || 'No coordinated activity detected'}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'anomalies' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {(['all', 'low', 'medium', 'high', 'critical'] as SeverityFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    severityFilter === s
                      ? 'border-[#1D1D1F] bg-[#1D1D1F] text-white'
                      : 'border-[#E5E5E5] text-[#86868B] hover:border-[#1D1D1F]'
                  }`}
                >
                  {s === 'all' ? t('all') : t(s)}
                </button>
              ))}
            </div>

            {filteredAnomalies.length === 0 ? (
              <EmptyState
                title={t('noAnomalies')}
                description={t('noAnomaliesDesc')}
              />
            ) : (
              <div className="space-y-3">
                {filteredAnomalies.map((anomaly) => (
                  <div
                    key={anomaly.id}
                    className="border border-[#E5E5E5] rounded-xl p-4"
                    style={{ borderLeftColor: SEVERITY_COLORS[anomaly.severity], borderLeftWidth: 3 }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm text-[#1D1D1F]">{anomaly.description}</p>
                      <Badge
                        variant={
                          anomaly.severity === 'critical' ? 'error' :
                          anomaly.severity === 'high' ? 'error' :
                          anomaly.severity === 'medium' ? 'warning' : 'gray'
                        }
                      >
                        {t(anomaly.severity)}
                      </Badge>
                    </div>
                    <p className="text-xs text-[#86868B] mt-2">
                      {new Date(anomaly.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
