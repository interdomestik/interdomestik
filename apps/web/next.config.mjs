import withBundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@interdomestik/ui',
    '@interdomestik/database',
    '@interdomestik/domain-claims',
    '@interdomestik/domain-communications',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  output: 'standalone',
  // Silence Next.js dev origin warning for local dev and Playwright
  allowedDevOrigins: [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://ks.localhost:3000',
    'http://mk.localhost:3000',
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  serverExternalPackages: ['import-in-the-middle', 'require-in-the-middle'],
};

import { withAxiom } from 'next-axiom';

const finalConfig = bundleAnalyzer(withNextIntl(nextConfig));

export default withSentryConfig(withAxiom(finalConfig), {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: 'interdomestik',
  project: 'web-app',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your Sentry bill.
  tunnelRoute: '/monitoring',

  // Hides source maps from visitors
  hideSourceMaps: true,

  // Webpack-specific options (fixes deprecation warnings)
  webpack: {
    reactComponentAnnotation: {
      enabled: true,
    },
    treeshake: {
      removeDebugLogging: true,
    },
    automaticVercelMonitors: true,
  },
});
