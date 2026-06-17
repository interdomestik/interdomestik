import { describe, expect, it, vi } from 'vitest';

import { withTransientRetry } from './transient-retry';

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
    const operation = vi.fn().mockRejectedValue(new Error('invalid payload'));

    const result = await withTransientRetry(operation, { clock: fakeClock() });

    expect(result).toMatchObject({
      ok: false,
      attempts: 1,
      kind: 'validation',
      retryable: false,
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('respects quota retry-after and quota attempt limits', async () => {
    const clock = fakeClock();
    const error = Object.assign(new Error('rate limited'), {
      headers: { 'retry-after': '1' },
      status: 429,
    });
    const operation = vi.fn().mockRejectedValue(error);

    const result = await withTransientRetry(operation, { clock, initialDelayMs: 25 });

    expect(result).toMatchObject({ ok: false, attempts: 2, kind: 'quota' });
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

    expect(result).toMatchObject({ ok: false, attempts: 1, kind: 'transient' });
    expect(clock.sleep).not.toHaveBeenCalled();
  });
});
