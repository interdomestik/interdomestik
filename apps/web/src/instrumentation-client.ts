import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isAutomated = process.env.NEXT_PUBLIC_INTERDOMESTIK_AUTOMATED === '1';
const isPlaceholder = dsn === 'https://your-dsn@sentry.io/project-id';
const isEnabled = process.env.NODE_ENV === 'production' && !isAutomated && !!dsn && !isPlaceholder;

Sentry.init({
  dsn: isEnabled ? dsn : undefined,
  // Keep noise down; tune in production as needed.
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  enabled: isEnabled,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
