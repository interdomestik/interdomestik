import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sessionRead = vi.hoisted(() => vi.fn());
const clientSessionRead = vi.hoisted(() => vi.fn());
vi.mock('@/components/auth/login-session-client', () => ({ readLoginSession: sessionRead }));
vi.mock('@/lib/auth-client', () => ({ authClient: { getSession: clientSessionRead } }));

import { resolveAuthenticatedRole } from './login-post-authentication';

describe('authoritative role propagation after sign-in', () => {
  beforeEach(() => {
    sessionRead.mockReset();
    clientSessionRead
      .mockReset()
      .mockResolvedValue({ data: { user: { role: 'legacy-client-role' } } });
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('continues immediately with the authoritative role and same admin result', async () => {
    sessionRead.mockResolvedValue({ role: 'member', hasAdminAccess: false });
    await expect(resolveAuthenticatedRole()).resolves.toEqual({
      role: 'member',
      hasAdminAccess: false,
      timedOut: false,
    });
    expect(sessionRead).toHaveBeenCalledTimes(1);
    expect(clientSessionRead).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for cookie propagation before exactly one new action invocation', async () => {
    sessionRead.mockResolvedValueOnce({ hasAdminAccess: false });
    sessionRead.mockResolvedValueOnce({ role: 'staff', hasAdminAccess: false });
    const result = resolveAuthenticatedRole();
    await vi.advanceTimersByTimeAsync(249);
    expect(sessionRead).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({
      role: 'staff',
      hasAdminAccess: false,
      timedOut: false,
    });
    expect(sessionRead).toHaveBeenCalledTimes(2);
    expect(clientSessionRead).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out after two roleless or rate-limited results without further retries', async () => {
    sessionRead.mockResolvedValue({ hasAdminAccess: false });
    const result = resolveAuthenticatedRole();
    await vi.advanceTimersByTimeAsync(250);
    await expect(result).resolves.toEqual({ hasAdminAccess: false, timedOut: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(sessionRead).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates an action error before retrying', async () => {
    const failure = new Error('Provider unavailable');
    sessionRead.mockRejectedValue(failure);
    await expect(resolveAuthenticatedRole()).rejects.toBe(failure);
    expect(sessionRead).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates an error on the delayed second action invocation', async () => {
    const failure = new Error('Provider unavailable');
    sessionRead.mockResolvedValueOnce({ hasAdminAccess: false }).mockRejectedValueOnce(failure);
    const rejection = expect(resolveAuthenticatedRole()).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(250);
    await rejection;
    expect(sessionRead).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry primary admin denial or navigate with an earlier result', async () => {
    sessionRead.mockResolvedValue({ role: 'admin', hasAdminAccess: false });
    await expect(resolveAuthenticatedRole()).resolves.toEqual({
      role: 'admin',
      hasAdminAccess: false,
      timedOut: false,
    });
    expect(sessionRead).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains both role and admin decision from the delayed result', async () => {
    sessionRead.mockResolvedValueOnce({ hasAdminAccess: false });
    sessionRead.mockResolvedValueOnce({ role: 'super_admin', hasAdminAccess: true });
    const result = resolveAuthenticatedRole();
    await vi.advanceTimersByTimeAsync(250);
    await expect(result).resolves.toEqual({
      role: 'super_admin',
      hasAdminAccess: true,
      timedOut: false,
    });
    expect(sessionRead).toHaveBeenCalledTimes(2);
  });
});
