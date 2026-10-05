import * as Sentry from '@sentry/nextjs';
import { isSentryTelemetryEnabled } from './sentry-sampling';

export type CriticalAction = 'login_submit' | 'saved_draft_submit';
export type CriticalActionOutcome =
  'success' | 'navigation_started' | 'rejected' | 'unexpected' | 'stale_deployment' | 'cancelled';
export const CRITICAL_ACTION_SLOW_MS = 3_000;
export const CRITICAL_ACTION_STALLED_MS = 10_000;

function safely(operation: () => void): void {
  try {
    operation();
  } catch {
    /* Monitoring must never fail a business action. */
  }
}

export function startCriticalAction(action: CriticalAction): {
  finish: (outcome: CriticalActionOutcome) => void;
} {
  const enabled = isSentryTelemetryEnabled({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    nodeEnv: process.env.NODE_ENV,
    automated: process.env.NEXT_PUBLIC_INTERDOMESTIK_AUTOMATED === '1',
  });
  if (!enabled) return { finish: () => undefined };
  const started = performance.now();
  let finished = false;
  let span: ReturnType<typeof Sentry.startInactiveSpan>;
  safely(() => {
    span = Sentry.startInactiveSpan({
      name: 'Critical UI action',
      op: 'ui.action',
      attributes: { ui_action: action },
    });
  });
  const stalled = setTimeout(
    () =>
      safely(() => {
        if (finished) return;
        Sentry.captureMessage('Critical UI action stalled', {
          level: 'warning',
          tags: { ui_action: action, ui_outcome: 'stalled' },
        });
      }),
    CRITICAL_ACTION_STALLED_MS
  );
  return {
    finish(outcome) {
      if (finished) return;
      finished = true;
      clearTimeout(stalled);
      const duration = Math.max(0, performance.now() - started);
      safely(() => {
        span?.setAttribute('duration_ms', duration);
        span?.setAttribute('ui_outcome', outcome);
        span?.end();
      });
      safely(() => {
        Sentry.addBreadcrumb({
          category: 'ui.action',
          level: outcome === 'unexpected' ? 'error' : 'info',
          data: { ui_action: action, ui_outcome: outcome, duration_ms: duration },
        });
      });
      if (outcome === 'unexpected')
        safely(() => {
          Sentry.captureMessage('Critical UI action failed', {
            level: 'error',
            tags: { ui_action: action, ui_outcome: outcome },
          });
        });
      else if (duration >= CRITICAL_ACTION_SLOW_MS)
        safely(() => {
          Sentry.captureMessage('Critical UI action slow', {
            level: 'warning',
            tags: { ui_action: action, ui_outcome: 'slow' },
          });
        });
    },
  };
}
