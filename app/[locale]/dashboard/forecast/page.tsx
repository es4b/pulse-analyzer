'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ForecastResult, Wallet } from '@/lib/supabase/types';

type Timeframe = '1h' | '24h' | '48h' | '7d';

const TIMEFRAMES: Timeframe[] = ['1h', '24h', '48h', '7d'];

function ConfidenceDisplay({ score }: { score: number }) {
  const color = score < 40 ? '#EF4444' : score < 70 ? '#F59E0B' : '#22C55E';
  return (
    <div className="border border-[#E5E5E5] rounded-xl p-6 text-center">
      <div className="text-5xl font-semibold mb-1" style={{ color }}>
        {score}%
      </div>
      <p className="text-xs text-[#86868B]">Confidence</p>
    </div>
  );
}

export default function ForecastPage() {
  const t = useTranslations('forecast');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('24h');
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    const res = await fetch('/api/wallet');
    const data = await res.json() as { wallet?: Wallet | null };
    setWallet(data.wallet ?? null);
  }, []);

  const loadForecast = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/forecast?timeframe=${tf}`);
      const data = await res.json() as { forecast?: ForecastResult | null };
      setForecast(data.forecast ?? null);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    Promise.all([loadWallet()]).finally(() => setInitialLoading(false));
  }, [loadWallet]);

  useEffect(() => {
    loadForecast(timeframe);
  }, [timeframe, loadForecast]);

  async function generateForecast() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe }),
      });
      const data = await res.json() as { forecast?: ForecastResult; error?: string };
      if (data.forecast) {
        setForecast(data.forecast);
      } else {
        setError(data.error || t('error'));
      }
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  const prediction = forecast?.prediction;
  const probabilities = prediction?.probabilities;

  const chartData = probabilities
    ? [
        { label: t('buyPls'), value: probabilities.buyPls },
        { label: t('moveToDex'), value: probabilities.moveToDex },
        { label: t('transferOut'), value: probabilities.transferOut },
        { label: t('hold'), value: probabilities.hold },
        { label: t('other'), value: probabilities.other },
      ]
    : [];

  const timeframeLabels: Record<Timeframe, string> = {
    '1h': t('timeframe1h'),
    '24h': t('timeframe24h'),
    '48h': t('timeframe48h'),
    '7d': t('timeframe7d'),
  };

  if (initialLoading) {
    return (
      <DashboardLayout wallet={wallet}>
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-64 w-full" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout wallet={wallet}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-[#1D1D1F]">{t('title')}</h1>
          <button
            onClick={generateForecast}
            disabled={loading}
            className="px-4 py-2 bg-[#1D1D1F] text-white text-sm font-medium rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            Generate
          </button>
        </div>

        <div className="flex gap-1 border border-[#E5E5E5] rounded-lg p-1 w-fit">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                timeframe === tf
                  ? 'bg-[#1D1D1F] text-white'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <svg className="animate-spin w-8 h-8 text-[#1D1D1F]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-[#86868B]">{t('loading')}</p>
          </div>
        )}

        {error && !loading && (
          <ErrorState message={error} onRetry={() => loadForecast(timeframe)} retryLabel={t('retry')} />
        )}

        {!loading && !error && !forecast && (
          <EmptyState title={t('noData')} description={t('noDataDesc')} />
        )}

        {!loading && !error && prediction && probabilities && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 border border-[#E5E5E5] rounded-xl p-6">
                <h3 className="text-sm font-medium text-[#1D1D1F] mb-4">
                  {t('probability')} — {timeframeLabels[timeframe]}
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} layout="vertical">
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#86868B' }} />
                    <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#86868B' }} width={90} />
                    <Tooltip
                      formatter={(val) => [`${val}%`]}
                      contentStyle={{ border: '1px solid #E5E5E5', borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill="#1D1D1F" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <ConfidenceDisplay score={prediction.confidence} />
            </div>

            <div className="border border-[#E5E5E5] rounded-xl p-6">
              <h3 className="text-sm font-medium text-[#1D1D1F] mb-3">{t('patternMatching')}</h3>
              <p className="text-sm text-[#86868B]">{prediction.patternMatch}</p>
            </div>

            {prediction.riskWarnings && prediction.riskWarnings.length > 0 && (
              <div className="border border-[#E5E5E5] rounded-xl p-6">
                <h3 className="text-sm font-medium text-[#1D1D1F] mb-3">{t('riskWarnings')}</h3>
                <div className="space-y-2">
                  {prediction.riskWarnings.map((warning, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 bg-[#EF4444]/5 border border-[#EF4444]/20 rounded-lg">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-0.5 shrink-0">
                        <path d="M7 1L13 12H1L7 1z" stroke="#EF4444" strokeWidth="1.2" />
                        <path d="M7 5v3M7 9.5h.01" stroke="#EF4444" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      <p className="text-sm text-[#EF4444]">{warning}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border border-[#E5E5E5] rounded-xl p-6">
              <h3 className="text-sm font-medium text-[#1D1D1F] mb-3">{t('aiInterpretation')}</h3>
              <p className="text-sm text-[#86868B] leading-relaxed">{prediction.interpretation}</p>
            </div>
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
