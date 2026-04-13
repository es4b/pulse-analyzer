'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';

export function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(newLocale: string) {
    const segments = pathname.split('/');
    segments[1] = newLocale;
    router.push(segments.join('/'));
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        onClick={() => switchLocale('en')}
        className={`px-2 py-1 rounded transition-colors ${
          locale === 'en'
            ? 'text-[#1D1D1F] font-medium'
            : 'text-[#86868B] hover:text-[#1D1D1F]'
        }`}
      >
        EN
      </button>
      <span className="text-[#E5E5E5]">|</span>
      <button
        onClick={() => switchLocale('lt')}
        className={`px-2 py-1 rounded transition-colors ${
          locale === 'lt'
            ? 'text-[#1D1D1F] font-medium'
            : 'text-[#86868B] hover:text-[#1D1D1F]'
        }`}
      >
        LT
      </button>
    </div>
  );
}
