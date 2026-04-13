import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default withNextIntl(nextConfig);
