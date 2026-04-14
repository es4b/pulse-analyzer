'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { motion } from 'framer-motion';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import Link from 'next/link';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }

    setLoading(true);

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError('Tada paprastinam, gerai');
      setLoading(false);
      return;
    }

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      router.push(`/${locale}/auth`);
    } else {
      router.push(`/${locale}/dashboard`);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex justify-end p-6">
        <LanguageToggle />
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="text-center mb-10">
            <div className="w-10 h-10 bg-[#1D1D1F] rounded-xl mx-auto mb-6 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-[#1D1D1F] mb-2">
              {t('registerTitle')}
            </h1>
            <p className="text-sm text-[#86868B]">{t('registerSubtitle')}</p>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 border border-[#EF4444]/20 bg-[#EF4444]/5 rounded-xl">
              <p className="text-sm text-[#EF4444] text-center">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#1D1D1F] tracking-wide uppercase">
                {t('emailLabel')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                required
                autoComplete="email"
                className="w-full px-4 py-3 text-sm text-[#1D1D1F] bg-white border border-[#E5E5E5] rounded-xl outline-none transition-colors placeholder:text-[#86868B] focus:border-[#1D1D1F]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#1D1D1F] tracking-wide uppercase">
                {t('passwordLabel')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                required
                autoComplete="new-password"
                className="w-full px-4 py-3 text-sm text-[#1D1D1F] bg-white border border-[#E5E5E5] rounded-xl outline-none transition-colors placeholder:text-[#86868B] focus:border-[#1D1D1F]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#1D1D1F] tracking-wide uppercase">
                {t('confirmPasswordLabel')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('confirmPasswordPlaceholder')}
                required
                autoComplete="new-password"
                className="w-full px-4 py-3 text-sm text-[#1D1D1F] bg-white border border-[#E5E5E5] rounded-xl outline-none transition-colors placeholder:text-[#86868B] focus:border-[#1D1D1F]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1D1D1F] text-white text-sm font-medium rounded-xl hover:opacity-80 transition-opacity disabled:opacity-50 mt-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('creatingAccount')}
                </>
              ) : (
                t('createAccountButton')
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-[#86868B]">
            {t('hasAccount')}{' '}
            <Link
              href={`/${locale}/auth`}
              className="text-[#1D1D1F] font-medium hover:underline underline-offset-4"
            >
              {t('loginLink')}
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
