import { beforeEach, describe, expect, it, vi } from 'vitest';
const sentry = vi.hoisted(() => ({ addBreadcrumb: vi.fn(), captureMessage: vi.fn() }));
vi.mock('@sentry/nextjs', () => sentry);
import { reportDatabaseReadiness } from './database-readiness';

describe('optional finalized DB readiness observation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('emits only fixed status fields; foreign properties and native error data are excluded', async () => {
    await reportDatabaseReadiness({
      phase: 'failed',
      reason: 'query_failed',
      checkedRole: 'connection',
      timedOut: true,
      password: 'synthetic-secret',
      url: 'synthetic-private-url',
      error: new Error('synthetic-sql'),
    } as never);
    const serialized = JSON.stringify([
      sentry.addBreadcrumb.mock.calls,
      sentry.captureMessage.mock.calls,
    ]);
    expect(serialized).toContain('query_failed');
    expect(serialized).not.toMatch(/synthetic-secret|synthetic-private-url|synthetic-sql/);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'database.rls.readiness.failed',
      expect.any(Object)
    );
  });
  it('never publishes pending or idle as ready', async () => {
    await reportDatabaseReadiness({ phase: 'idle' });
    await reportDatabaseReadiness({ phase: 'pending' });
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
  it('absorbs both synchronous and asynchronous reporting failures without rejecting the observer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      sentry.addBreadcrumb.mockImplementationOnce(() => {
        throw new Error('synthetic sink failure');
      });
      await expect(reportDatabaseReadiness({ phase: 'ready' })).resolves.toBeUndefined();
      sentry.addBreadcrumb.mockResolvedValueOnce(undefined);
      sentry.captureMessage.mockRejectedValueOnce(new Error('synthetic async failure'));
      await expect(
        reportDatabaseReadiness({ phase: 'failed', reason: 'query_failed' })
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});
