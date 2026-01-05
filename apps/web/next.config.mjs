import withBundleAnalyzer from '@next/bundle-analyzer';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@interdomestik/ui', '@interdomestik/database'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  // Silence Next.js dev origin warning for local dev and Playwright
  allowedDevOrigins: ['http://127.0.0.1:3000', 'http://localhost:3000'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default bundleAnalyzer(withNextIntl(nextConfig));
