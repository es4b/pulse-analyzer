import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'lt'],
  defaultLocale: 'en',
  localePrefix: 'always',
});
