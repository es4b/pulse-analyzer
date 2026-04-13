'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { LanguageToggle } from '@/components/ui/LanguageToggle';

export default function LandingPage() {
  const t = useTranslations('landing');
  const locale = useLocale();

  return (
    <div className="min-h-screen bg-white text-[#1D1D1F]">
      <header className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-b border-[#E5E5E5] z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">Pulse Analyzer</span>
          <div className="flex items-center gap-4">
            <LanguageToggle />
            <Link
              href={`/${locale}/auth`}
              className="text-sm text-[#86868B] hover:text-[#1D1D1F] transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-14">
        <section className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
          <h1 className="text-5xl font-semibold tracking-tight text-[#1D1D1F] leading-tight mb-6">
            {t('heroTitle')}
          </h1>
          <p className="text-lg text-[#86868B] max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('heroSubtitle')}
          </p>
          <Link
            href={`/${locale}/auth`}
            className="inline-flex items-center px-6 py-3 bg-[#1D1D1F] text-white text-sm font-medium rounded-lg hover:opacity-80 transition-opacity"
          >
            {t('heroCta')}
          </Link>
        </section>

        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#E5E5E5]">
          <h2 className="text-2xl font-semibold text-[#1D1D1F] mb-12 text-center">
            {t('featuresTitle')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-[#E5E5E5] rounded-xl p-8">
              <div className="w-8 h-8 bg-[#F5F5F7] rounded-lg flex items-center justify-center mb-4">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 12l4-4 3 3 5-6" stroke="#1D1D1F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-[#1D1D1F] mb-4">{t('analysisTitle')}</h3>
              <ul className="space-y-2">
                {(['analysisBullet1', 'analysisBullet2', 'analysisBullet3', 'analysisBullet4'] as const).map((key) => (
                  <li key={key} className="flex items-start gap-2 text-sm text-[#86868B]">
                    <span className="mt-1 shrink-0 w-1 h-1 rounded-full bg-[#86868B]" />
                    {t(key)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="border border-[#E5E5E5] rounded-xl p-8">
              <div className="w-8 h-8 bg-[#F5F5F7] rounded-lg flex items-center justify-center mb-4">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="#1D1D1F" strokeWidth="1.5" />
                  <path d="M8 5v3l2 2" stroke="#1D1D1F" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-[#1D1D1F] mb-4">{t('forecastTitle')}</h3>
              <ul className="space-y-2">
                {(['forecastBullet1', 'forecastBullet2', 'forecastBullet3', 'forecastBullet4'] as const).map((key) => (
                  <li key={key} className="flex items-start gap-2 text-sm text-[#86868B]">
                    <span className="mt-1 shrink-0 w-1 h-1 rounded-full bg-[#86868B]" />
                    {t(key)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#E5E5E5]">
          <h2 className="text-2xl font-semibold text-[#1D1D1F] mb-12 text-center">
            {t('howItWorksTitle')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {([
              { num: '1', titleKey: 'step1Title', descKey: 'step1Desc' },
              { num: '2', titleKey: 'step2Title', descKey: 'step2Desc' },
              { num: '3', titleKey: 'step3Title', descKey: 'step3Desc' },
            ] as const).map(({ num, titleKey, descKey }) => (
              <div key={num} className="text-center">
                <div className="text-3xl font-semibold text-[#E5E5E5] mb-4">{num}</div>
                <h3 className="text-base font-semibold text-[#1D1D1F] mb-2">{t(titleKey)}</h3>
                <p className="text-sm text-[#86868B] leading-relaxed">{t(descKey)}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E5E5E5] py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-sm font-semibold text-[#1D1D1F]">Pulse Analyzer</span>
            <p className="text-xs text-[#86868B] mt-1">{t('copyright')}</p>
          </div>
          <div className="flex items-center gap-4">
            <LanguageToggle />
            <Link
              href={`/${locale}/auth`}
              className="text-sm text-[#86868B] hover:text-[#1D1D1F] transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
