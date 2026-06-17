import { describe, expect, it, vi } from 'vitest';

import { throwTransientRetryFailure, withTransientRetry } from './transient-retry';

function fakeClock() {
  let now = 0;
  return {
    now: () => now,
    sleep: vi.fn(async (ms: number) => {
      now += ms;
    }),
  };
}

describe('withTransientRetry', () => {
  it('retries transient failures within budget and returns attempts', async () => {
    const clock = fakeClock();
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce('ok');

    const result = await withTransientRetry(operation, { clock, initialDelayMs: 25 });

    expect(result).toEqual({ ok: true, value: 'ok', attempts: 2, elapsedMs: 25 });
    expect(clock.sleep).toHaveBeenCalledWith(25);
  });

  it('does not retry validation, auth, permanent, or unknown failures', async () => {
    const cases = [
      [new Error('invalid payload'), 'validation'],
      [Object.assign(new Error('forbidden'), { status: 403 }), 'auth'],
      [Object.assign(new Error('not found'), { status: 404 }), 'permanent'],
      [new Error('unclassified failure'), 'unknown'],
    ] as const;

    for (const [error, kind] of cases) {
      const operation = vi.fn().mockRejectedValue(error);
      const result = await withTransientRetry(operation, { clock: fakeClock() });

      expect(result).toMatchObject({ ok: false, attempts: 1, kind, retryable: false });
      expect(operation).toHaveBeenCalledTimes(1);
    }
  });

  it('respects quota retry-after and quota attempt limits', async () => {
    const clock = fakeClock();
    const error = Object.assign(new Error('rate limited'), {
      headers: { 'retry-after': '1' },
      status: 429,
    });
    const operation = vi.fn().mockRejectedValue(error);

    const result = await withTransientRetry(operation, { clock, initialDelayMs: 25 });

    expect(result).toMatchObject({ ok: false, attempts: 2, kind: 'quota', retryable: true });
    expect(clock.sleep).toHaveBeenCalledWith(1_000);
  });

  it('stops before the next delay would exceed max elapsed budget', async () => {
    const clock = fakeClock();
    const operation = vi.fn().mockRejectedValue(new Error('fetch failed'));

    const result = await withTransientRetry(operation, {
      clock,
      initialDelayMs: 60,
      maxElapsedMs: 50,
    });

    expect(result).toMatchObject({ ok: false, attempts: 1, kind: 'transient', retryable: true });
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it('marks exhausted transient attempt limits as retryable failures', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('fetch failed'));

    const result = await withTransientRetry(operation, {
      clock: fakeClock(),
      maxTransientAttempts: 2,
    });

    expect(result).toMatchObject({ ok: false, attempts: 2, kind: 'transient', retryable: true });
  });

  it('retains a plain-object cause when throwing retry failures', async () => {
    const cause = { message: 'storage 503', statusCode: 503 };
    const result = await withTransientRetry(vi.fn().mockRejectedValue(cause), {
      clock: fakeClock(),
      maxTransientAttempts: 1,
    });

    expect(result).toMatchObject({ ok: false, retryable: true });
    expect(() => {
      if (!result.ok) throwTransientRetryFailure(result, 'fallback');
    }).toThrow(expect.objectContaining({ cause }));
  });
});
