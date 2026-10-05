import * as Sentry from '@sentry/nextjs';
import {
  DEFAULT_TRACES_SAMPLE_RATE,
  isSentryTelemetryEnabled,
  resolveEnabledSampleRate,
} from '@/lib/observability/sentry-sampling';
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentrySpan,
} from '@/lib/observability/sentry-privacy';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
const isEnabled = isSentryTelemetryEnabled({
  dsn,
  nodeEnv: process.env.NODE_ENV,
  automated: process.env.INTERDOMESTIK_AUTOMATED === '1' || process.env.PLAYWRIGHT === '1',
});

try {
  Sentry.init({
    dsn: isEnabled ? dsn : undefined,
    enabled: isEnabled,
    sendDefaultPii: false,
    tracesSampleRate: resolveEnabledSampleRate(
      isEnabled,
      process.env.SENTRY_TRACES_SAMPLE_RATE,
      DEFAULT_TRACES_SAMPLE_RATE
    ),
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
    beforeSendSpan: scrubSentrySpan,
    beforeBreadcrumb: scrubSentryBreadcrumb,
  });
} catch {
  /* Monitoring cannot block runtime startup. */
}
