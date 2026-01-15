import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
const isAutomated = process.env.INTERDOMESTIK_AUTOMATED === '1' || process.env.PLAYWRIGHT === '1';
const isPlaceholder = dsn === 'https://your-dsn@sentry.io/project-id';
const isEnabled = process.env.NODE_ENV === 'production' && !isAutomated && !!dsn && !isPlaceholder;

Sentry.init({
  dsn: isEnabled ? dsn : undefined,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  enabled: isEnabled,
});
