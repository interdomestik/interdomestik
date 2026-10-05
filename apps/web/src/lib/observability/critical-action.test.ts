import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import { startCriticalAction } from './critical-action';
const span = vi.hoisted(() => ({ setAttribute: vi.fn(), end: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({
  startInactiveSpan: vi.fn(() => span),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@sentry.example/123');
  vi.stubEnv('NEXT_PUBLIC_INTERDOMESTIK_AUTOMATED', '0');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('critical action outcomes', () => {
  it('emits exactly one stalled warning, does not finish the action, and clears timers on eventual completion', () => {
    const action = startCriticalAction('saved_draft_submit');
    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(20_000);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith('Critical UI action stalled', {
      level: 'warning',
      tags: { ui_action: 'saved_draft_submit', ui_outcome: 'stalled' },
    });
    expect(span.end).not.toHaveBeenCalled();
    action.finish('success');
    action.finish('unexpected');
    expect(span.end).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['rejected', 'stale_deployment', 'cancelled', 'success', 'navigation_started'] as const)(
    'records expected %s as a safe breadcrumb without unexpected error',
    outcome => {
      const action = startCriticalAction('login_submit');
      vi.advanceTimersByTime(100);
      action.finish(outcome);
      vi.advanceTimersByTime(20_000);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { ui_action: 'login_submit', ui_outcome: outcome, duration_ms: 100 },
        })
      );
      expect(span.end).toHaveBeenCalledOnce();
    }
  );
  it('emits a fixed failure error only once and a slow diagnostic at 3000ms', () => {
    const failed = startCriticalAction('login_submit');
    failed.finish('unexpected');
    failed.finish('unexpected');
    expect(Sentry.captureMessage).toHaveBeenCalledOnce();
    expect(Sentry.captureMessage).toHaveBeenCalledWith('Critical UI action failed', {
      level: 'error',
      tags: { ui_action: 'login_submit', ui_outcome: 'unexpected' },
    });
    const slow = startCriticalAction('saved_draft_submit');
    vi.advanceTimersByTime(3000);
    slow.finish('success');
    expect(Sentry.captureMessage).toHaveBeenCalledWith('Critical UI action slow', {
      level: 'warning',
      tags: { ui_action: 'saved_draft_submit', ui_outcome: 'slow' },
    });
    expect(span.setAttribute).toHaveBeenCalledWith('duration_ms', 3000);
  });
  it('isolates SDK throws from start, stalled warning, finish and breadcrumbs', () => {
    vi.mocked(Sentry.startInactiveSpan).mockImplementationOnce(() => {
      throw Error('SDK');
    });
    vi.mocked(Sentry.captureMessage).mockImplementation(() => {
      throw Error('SDK');
    });
    vi.mocked(Sentry.addBreadcrumb).mockImplementationOnce(() => {
      throw Error('SDK');
    });
    const action = startCriticalAction('login_submit');
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
    expect(() => action.finish('unexpected')).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
    vi.mocked(Sentry.captureMessage).mockReset();
  });
  it.each(['development', 'automated', 'missing-dsn'])('remains inert for %s', gate => {
    if (gate === 'development') vi.stubEnv('NODE_ENV', 'development');
    if (gate === 'automated') vi.stubEnv('NEXT_PUBLIC_INTERDOMESTIK_AUTOMATED', '1');
    if (gate === 'missing-dsn') vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    startCriticalAction('login_submit').finish('unexpected');
    expect(vi.getTimerCount()).toBe(0);
    expect(Sentry.startInactiveSpan).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
