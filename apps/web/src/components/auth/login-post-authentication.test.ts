import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sessionRead = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth-client', () => ({ authClient: { getSession: sessionRead } }));

import { resolveAuthenticatedRole } from './login-post-authentication';

describe('provider role propagation after sign-in', () => {
  beforeEach(() => {
    sessionRead.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('continues immediately when the first provider session already has a role', async () => {
    sessionRead.mockResolvedValue({ data: { user: { role: 'member' } } });

    await expect(resolveAuthenticatedRole()).resolves.toEqual({ role: 'member', timedOut: false });

    expect(sessionRead).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for cookie propagation before exactly one retry and uses its role', async () => {
    sessionRead.mockResolvedValueOnce({ data: null });
    sessionRead.mockResolvedValueOnce({ data: { user: { role: 'staff' } } });
    const result = resolveAuthenticatedRole();

    await vi.advanceTimersByTimeAsync(249);
    expect(sessionRead).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({ role: 'staff', timedOut: false });
    expect(sessionRead).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out after two roleless sessions without further retries', async () => {
    sessionRead.mockResolvedValue({ data: { user: {} } });
    const result = resolveAuthenticatedRole();
    await vi.advanceTimersByTimeAsync(250);

    await expect(result).resolves.toEqual({ timedOut: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(sessionRead).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates a provider error before retrying', async () => {
    const failure = new Error('Provider unavailable');
    sessionRead.mockRejectedValue(failure);

    await expect(resolveAuthenticatedRole()).rejects.toBe(failure);
    expect(sessionRead).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates an error on the delayed second read', async () => {
    const failure = new Error('Provider unavailable');
    sessionRead.mockResolvedValueOnce({ data: null }).mockRejectedValueOnce(failure);
    const rejection = expect(resolveAuthenticatedRole()).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(250);

    await rejection;
    expect(sessionRead).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
