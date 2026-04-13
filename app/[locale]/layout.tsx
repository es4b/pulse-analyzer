import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import type { AbstractIntlMessages } from 'next-intl';
import SessionProvider from '@/components/layout/SessionProvider';
import IntlProvider from '@/components/layout/IntlProvider';
import '../globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Pulse Analyzer',
  description: 'Analyze PulseChain wallets and predict behavior',
};

const locales = ['en', 'lt'];

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale)) {
    notFound();
  }

  const messages = (await import(`@/messages/${locale}.json`)).default as AbstractIntlMessages;

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <SessionProvider>
          <IntlProvider locale={locale} messages={messages}>
            {children}
          </IntlProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
