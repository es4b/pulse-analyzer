'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import type { Wallet } from '@/lib/supabase/types';

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
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
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
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('walletAddressPlaceholder')}
              className="w-full px-3 py-2.5 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#1D1D1F] transition-colors font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[#86868B] mb-1.5">{t('walletLabel')}</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('walletLabelPlaceholder')}
              className="w-full px-3 py-2.5 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#1D1D1F] transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
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

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet');
      const data = await res.json() as { wallet?: Wallet | null; error?: string };
      setWallet(data.wallet ?? null);
    } catch {
      setError(t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetch('/api/wallet/refresh', { method: 'POST' });
      await loadWallet();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadWallet]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <ErrorState message={error} onRetry={loadWallet} />
      </DashboardLayout>
    );
  }

  if (!wallet) {
    return (
      <DashboardLayout>
        <AddWalletForm onAdded={(w) => setWallet(w)} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      wallet={wallet}
      lastUpdated={wallet.last_updated}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        <div>
          <h1 className="text-xl font-semibold text-[#1D1D1F]">{t('wallet')}</h1>
          <p className="text-sm text-[#86868B] mt-1 font-mono">{wallet.address}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['Analysis', 'Forecast', 'Settings'].map((item) => (
            <div key={item} className="border border-[#E5E5E5] rounded-xl p-5 hover:border-[#1D1D1F] transition-colors cursor-pointer">
              <p className="text-xs text-[#86868B] mb-2">{item}</p>
              <p className="text-sm text-[#1D1D1F]">View {item.toLowerCase()} →</p>
            </div>
          ))}
        </div>

        <div className="border border-[#E5E5E5] rounded-xl p-6">
          <p className="text-sm text-[#86868B] mb-1">{t('lastUpdated')}</p>
          <p className="text-sm text-[#1D1D1F]">
            {wallet.last_updated
              ? new Date(wallet.last_updated).toLocaleString()
              : '—'}
          </p>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
