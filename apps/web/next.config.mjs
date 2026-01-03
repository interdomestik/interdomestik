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
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://*.paddle.com;
              style-src 'self' 'unsafe-inline';
              img-src 'self' blob: data: https://*.supabase.co https://*.paddle.com;
              font-src 'self';
              connect-src 'self' https://*.supabase.co https://*.paddle.com;
              frame-src 'self' https://*.paddle.com;
              object-src 'none';
            `
              .replace(/\s{2,}/g, ' ')
              .trim(),
          },
        ],
      },
    ];
  },
};

export default bundleAnalyzer(withNextIntl(nextConfig));
