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
import {
  initializeConsentReplay,
  stopReplayForNavigation,
} from '@/lib/observability/sentry-replay-consent';
import {
  DEFAULT_REPLAY_SESSION_SAMPLE_RATE,
  DEFAULT_REPLAY_ON_ERROR_SAMPLE_RATE,
} from '@/lib/observability/sentry-sampling';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isEnabled = isSentryTelemetryEnabled({
  dsn,
  nodeEnv: process.env.NODE_ENV,
  automated: process.env.NEXT_PUBLIC_INTERDOMESTIK_AUTOMATED === '1',
});

try {
  Sentry.init({
    dsn: isEnabled ? dsn : undefined,
    enabled: isEnabled,
    sendDefaultPii: false,
    tracesSampleRate: resolveEnabledSampleRate(
      isEnabled,
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
      DEFAULT_TRACES_SAMPLE_RATE
    ),
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
    beforeSendSpan: scrubSentrySpan,
    beforeBreadcrumb: scrubSentryBreadcrumb,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
} catch {
  /* Monitoring cannot block runtime startup. */
}

try {
  initializeConsentReplay(
    isEnabled,
    resolveEnabledSampleRate(
      isEnabled,
      process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
      DEFAULT_REPLAY_SESSION_SAMPLE_RATE
    ),
    resolveEnabledSampleRate(
      isEnabled,
      process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
      DEFAULT_REPLAY_ON_ERROR_SAMPLE_RATE
    )
  );
} catch {
  /* Consent-controlled diagnostics are optional. */
}

export const onRouterTransitionStart: typeof Sentry.captureRouterTransitionStart = (...args) => {
  try {
    stopReplayForNavigation();
  } catch {
    /* Optional telemetry. */
  }
  try {
    Sentry.captureRouterTransitionStart(...args);
  } catch {
    /* Optional telemetry. */
  }
};
