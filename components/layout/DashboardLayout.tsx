'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import type { Wallet } from '@/lib/supabase/types';

interface DashboardLayoutProps {
  children: React.ReactNode;
  wallet?: Wallet | null;
  lastUpdated?: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function DashboardLayout({
  children,
  wallet,
  lastUpdated,
  onRefresh,
  isRefreshing,
}: DashboardLayoutProps) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navLinks = [
    {
      href: `/${locale}/dashboard`,
      label: t('nav.dashboard'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
    },
    {
      href: `/${locale}/dashboard/analysis`,
      label: t('nav.analysis'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 12l4-4 3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      href: `/${locale}/dashboard/forecast`,
      label: t('nav.forecast'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      href: `/${locale}/dashboard/settings`,
      label: t('nav.settings'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      href: `/${locale}/dashboard/profile`,
      label: t('nav.profile'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-[#E5E5E5]">
        <span className="text-base font-semibold text-[#1D1D1F] tracking-tight">
          Pulse Analyzer
        </span>
      </div>

      {wallet && (
        <div className="px-4 py-4 border-b border-[#E5E5E5]">
          <p className="text-xs text-[#86868B] mb-1">{t('dashboard.wallet')}</p>
          <p className="text-sm font-mono text-[#1D1D1F] truncate">{truncateAddress(wallet.address)}</p>
          {wallet.label && (
            <p className="text-xs text-[#86868B] mt-0.5 truncate">{wallet.label}</p>
          )}
          {lastUpdated && (
            <p className="text-xs text-[#86868B] mt-1">{timeAgo(lastUpdated)}</p>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="mt-2 text-xs text-[#1D1D1F] hover:opacity-60 transition-opacity flex items-center gap-1 disabled:opacity-40"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className={isRefreshing ? 'animate-spin' : ''}
              >
                <path
                  d="M10 6A4 4 0 112 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path d="M10 3v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {isRefreshing ? t('dashboard.refreshing') : t('dashboard.refresh')}
            </button>
          )}
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-[#F5F5F7] text-[#1D1D1F] font-medium'
                  : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]'
              }`}
            >
              {link.icon}
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#E5E5E5] space-y-3">
        <LanguageToggle />
        <button
          onClick={() => signOut({ callbackUrl: `/${locale}` })}
          className="flex items-center gap-2 text-sm text-[#86868B] hover:text-[#1D1D1F] transition-colors w-full"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 11l3-3-3-3M13 8H6M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('nav.logout')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <aside className="hidden md:flex flex-col w-60 border-r border-[#E5E5E5] bg-white shrink-0">
        <SidebarContent />
      </aside>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 w-60 border-r border-[#E5E5E5] bg-white z-50 md:hidden flex flex-col"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center justify-center gap-2 bg-[#F59E0B] px-4 py-1.5 text-xs font-medium text-black">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L11 10H1L6 1z" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6 4.5v2.5M6 8.5h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          TEST MODE — No auth required. Remove before production.
        </div>

        <div className="md:hidden flex items-center px-4 h-14 border-b border-[#E5E5E5]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-[#1D1D1F]"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <span className="ml-3 text-sm font-semibold text-[#1D1D1F]">Pulse Analyzer</span>
        </div>

        <main className="flex-1 overflow-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
