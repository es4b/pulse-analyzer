'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import type { Wallet } from '@/lib/types';

export default function ProfilePage() {
  const t = useTranslations('profile');
  const { data: session } = useSession();
  const locale = useLocale();
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [label, setLabel] = useState('');
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteWallet, setConfirmDeleteWallet] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet');
      const data = await res.json() as { wallet?: Wallet | null };
      setWallet(data.wallet ?? null);
      setLabel(data.wallet?.label ?? '');
    } catch {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCopy() {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSaveLabel() {
    try {
      await fetch('/api/wallet/label', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      setWallet((w) => w ? { ...w, label } : null);
      setEditingLabel(false);
    } catch {
      setError('Failed to save label');
    }
  }

  async function handleDeleteWallet() {
    setDeleting(true);
    try {
      await fetch('/api/wallet', { method: 'DELETE' });
      setWallet(null);
      setConfirmDeleteWallet(false);
    } catch {
      setError('Failed to delete wallet');
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await fetch('/api/profile', { method: 'DELETE' });
      await signOut({ callbackUrl: `/${locale}` });
    } catch {
      setError('Failed to delete account');
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout wallet={wallet}>
        <div className="max-w-xl space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-40 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout wallet={wallet}>
        <ErrorState message={error} onRetry={load} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout wallet={wallet}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl space-y-6">
        <h1 className="text-xl font-semibold text-[#1D1D1F]">{t('title')}</h1>

        <div className="border border-[#E5E5E5] rounded-xl overflow-hidden">
          <div className="divide-y divide-[#E5E5E5]">
            <div className="px-5 py-4 flex items-center gap-4">
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt="Avatar"
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#F5F5F7] flex items-center justify-center">
                  <span className="text-lg font-medium text-[#86868B]">
                    {session?.user?.name?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-[#1D1D1F]">{session?.user?.name}</p>
                <p className="text-xs text-[#86868B]">{session?.user?.email}</p>
              </div>
            </div>

            <div className="px-5 py-4">
              <p className="text-xs text-[#86868B] mb-1">{t('email')}</p>
              <p className="text-sm text-[#1D1D1F]">{session?.user?.email}</p>
            </div>

            {wallet ? (
              <>
                <div className="px-5 py-4">
                  <p className="text-xs text-[#86868B] mb-1">{t('walletAddress')}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-[#1D1D1F] truncate">{wallet.address}</span>
                    <button
                      onClick={handleCopy}
                      className="shrink-0 text-xs text-[#86868B] hover:text-[#1D1D1F] transition-colors border border-[#E5E5E5] px-2 py-1 rounded"
                    >
                      {copied ? t('copied') : t('copy')}
                    </button>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <p className="text-xs text-[#86868B] mb-2">{t('walletLabel')}</p>
                  {editingLabel ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-sm border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#1D1D1F]"
                      />
                      <button
                        onClick={handleSaveLabel}
                        className="px-3 py-1.5 bg-[#1D1D1F] text-white text-sm rounded-lg hover:opacity-80"
                      >
                        {t('saveLabel')}
                      </button>
                      <button
                        onClick={() => setEditingLabel(false)}
                        className="px-3 py-1.5 border border-[#E5E5E5] text-sm rounded-lg hover:border-[#1D1D1F]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#1D1D1F]">{wallet.label || '—'}</span>
                      <button
                        onClick={() => setEditingLabel(true)}
                        className="text-xs text-[#86868B] hover:text-[#1D1D1F] transition-colors"
                      >
                        {t('editLabel')}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="px-5 py-4">
                <p className="text-sm text-[#86868B]">{t('noWallet')}</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => signOut({ callbackUrl: `/${locale}` })}
            className="w-full py-2.5 border border-[#E5E5E5] text-sm text-[#1D1D1F] font-medium rounded-lg hover:border-[#1D1D1F] transition-colors"
          >
            {t('signOut')}
          </button>

          {wallet && (
            <>
              {confirmDeleteWallet ? (
                <div className="border border-[#EF4444]/20 bg-[#EF4444]/5 rounded-xl p-4">
                  <p className="text-sm text-[#1D1D1F] mb-3">{t('deleteWalletConfirm')}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteWallet}
                      disabled={deleting}
                      className="flex-1 py-2 bg-[#EF4444] text-white text-sm font-medium rounded-lg hover:opacity-80 disabled:opacity-50"
                    >
                      {deleting ? t('deleting') : t('deleteWallet')}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteWallet(false)}
                      className="flex-1 py-2 border border-[#E5E5E5] text-sm rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteWallet(true)}
                  className="w-full py-2.5 border border-[#EF4444]/30 text-sm text-[#EF4444] font-medium rounded-lg hover:border-[#EF4444] transition-colors"
                >
                  {t('deleteWallet')}
                </button>
              )}
            </>
          )}

          {confirmDeleteAccount ? (
            <div className="border border-[#EF4444]/20 bg-[#EF4444]/5 rounded-xl p-4">
              <p className="text-sm text-[#1D1D1F] mb-3">{t('deleteAccountConfirm')}</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="flex-1 py-2 bg-[#EF4444] text-white text-sm font-medium rounded-lg hover:opacity-80 disabled:opacity-50"
                >
                  {deleting ? t('deleting') : t('deleteAccount')}
                </button>
                <button
                  onClick={() => setConfirmDeleteAccount(false)}
                  className="flex-1 py-2 border border-[#E5E5E5] text-sm rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDeleteAccount(true)}
              className="w-full py-2.5 text-sm text-[#86868B] hover:text-[#EF4444] transition-colors"
            >
              {t('deleteAccount')}
            </button>
          )}
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
