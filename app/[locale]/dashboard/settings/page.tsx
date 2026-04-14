'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Toggle } from '@/components/ui/Toggle';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import type { User, Wallet } from '@/lib/types';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [settings, setSettings] = useState<Partial<User>>({
    notify_email: true,
    notify_telegram: false,
    notify_viber: false,
    telegram_chat_id: '',
    viber_user_id: '',
    large_tx_threshold: 10000,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [walletRes, settingsRes] = await Promise.all([
        fetch('/api/wallet'),
        fetch('/api/settings'),
      ]);
      const walletData = await walletRes.json() as { wallet?: Wallet | null };
      const settingsData = await settingsRes.json() as { settings?: User | null };
      setWallet(walletData.wallet ?? null);
      if (settingsData.settings) {
        setSettings({
          notify_email: settingsData.settings.notify_email ?? true,
          notify_telegram: settingsData.settings.notify_telegram ?? false,
          notify_viber: settingsData.settings.notify_viber ?? false,
          telegram_chat_id: settingsData.settings.telegram_chat_id ?? '',
          viber_user_id: settingsData.settings.viber_user_id ?? '',
          large_tx_threshold: settingsData.settings.large_tx_threshold ?? 10000,
        });
      }
    } catch {
      setError(t('saveError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout wallet={wallet}>
        <div className="max-w-xl space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (error && !settings) {
    return (
      <DashboardLayout wallet={wallet}>
        <ErrorState message={error} onRetry={load} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout wallet={wallet}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl">
        <h1 className="text-xl font-semibold text-[#1D1D1F] mb-6">{t('title')}</h1>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="border border-[#E5E5E5] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E5E5]">
              <h2 className="text-sm font-medium text-[#1D1D1F]">{t('notifications')}</h2>
            </div>

            <div className="divide-y divide-[#E5E5E5]">
              <div className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#1D1D1F]">{t('email')}</p>
                    <p className="text-xs text-[#86868B] mt-0.5">{t('emailDesc')}</p>
                  </div>
                  <Toggle
                    checked={settings.notify_email ?? true}
                    onChange={(v) => setSettings((s) => ({ ...s, notify_email: v }))}
                  />
                </div>
              </div>

              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#1D1D1F]">{t('telegram')}</p>
                    <p className="text-xs text-[#86868B] mt-0.5">{t('telegramDesc')}</p>
                  </div>
                  <Toggle
                    checked={settings.notify_telegram ?? false}
                    onChange={(v) => setSettings((s) => ({ ...s, notify_telegram: v }))}
                  />
                </div>
                {settings.notify_telegram && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={settings.telegram_chat_id ?? ''}
                      onChange={(e) => setSettings((s) => ({ ...s, telegram_chat_id: e.target.value }))}
                      placeholder={t('telegramChatIdPlaceholder')}
                      className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#1D1D1F]"
                    />
                    <p className="text-xs text-[#86868B]">{t('telegramInstructions')}</p>
                  </div>
                )}
              </div>

              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[#1D1D1F]">{t('viber')}</p>
                    <p className="text-xs text-[#86868B] mt-0.5">{t('viberDesc')}</p>
                  </div>
                  <Toggle
                    checked={settings.notify_viber ?? false}
                    onChange={(v) => setSettings((s) => ({ ...s, notify_viber: v }))}
                  />
                </div>
                {settings.notify_viber && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={settings.viber_user_id ?? ''}
                      onChange={(e) => setSettings((s) => ({ ...s, viber_user_id: e.target.value }))}
                      placeholder={t('viberUserIdPlaceholder')}
                      className="w-full px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#1D1D1F]"
                    />
                    <p className="text-xs text-[#86868B]">{t('viberInstructions')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border border-[#E5E5E5] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E5E5]">
              <h2 className="text-sm font-medium text-[#1D1D1F]">{t('alertThresholds')}</h2>
            </div>
            <div className="px-5 py-4">
              <label className="block text-xs text-[#86868B] mb-2">{t('largeTxThresholdDesc')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={settings.large_tx_threshold ?? 10000}
                  onChange={(e) => setSettings((s) => ({ ...s, large_tx_threshold: Number(e.target.value) }))}
                  className="flex-1 px-3 py-2 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#1D1D1F]"
                  min={0}
                />
                <span className="text-sm text-[#86868B]">{t('currency')}</span>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-[#EF4444]">{error}</p>
          )}

          {saved && (
            <p className="text-sm text-[#22C55E]">{t('saved')}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-[#1D1D1F] text-white text-sm font-medium rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? t('saving') : t('save')}
          </button>
        </form>
      </motion.div>
    </DashboardLayout>
  );
}
