import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readLoginSession } from './login-session-client';
import { resolveAuthenticatedRole } from './login-post-authentication';

const fetchMock = vi.fn();

function successResponse(payload: unknown) {
  const json = vi.fn().mockResolvedValue(payload);
  return { json, response: { json, ok: true, status: 200 } as unknown as Response };
}

function denialResponse(status: number) {
  const json = vi.fn().mockRejectedValue(new Error('A denial body must never be read'));
  return { json, response: { json, ok: false, status } as unknown as Response };
}

describe('login session client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the minimal payload once over a same-origin uncached request', async () => {
    fetchMock.mockResolvedValue(
      successResponse({ hasAdminAccess: false, role: 'member' }).response
    );

    await expect(readLoginSession()).resolves.toEqual({ hasAdminAccess: false, role: 'member' });
    expect(fetchMock).toHaveBeenCalledOnce();
    // No caller query, no body, and no client-supplied identity hint.
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/login-session');
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      method: 'GET',
    });
  });

  it('keeps the authoritative admin grant from the endpoint', async () => {
    fetchMock.mockResolvedValue(
      successResponse({ hasAdminAccess: true, role: 'super_admin' }).response
    );

    await expect(readLoginSession()).resolves.toEqual({
      hasAdminAccess: true,
      role: 'super_admin',
    });
  });

  it.each([401, 429, 503])('returns a roleless denial for %s without a body read', async status => {
    const denial = denialResponse(status);
    fetchMock.mockResolvedValue(denial.response);

    await expect(readLoginSession()).resolves.toEqual({ hasAdminAccess: false });
    expect(denial.json).not.toHaveBeenCalled();
  });

  it.each([
    ['a null payload', null],
    ['a non-object payload', 'member'],
    ['a missing role', { hasAdminAccess: false }],
    ['a non-string role', { hasAdminAccess: false, role: 7 }],
  ] as [string, unknown][])('fails closed for %s', async (_label, payload) => {
    fetchMock.mockResolvedValue(successResponse(payload).response);

    await expect(readLoginSession()).resolves.toEqual({ hasAdminAccess: false });
  });

  it('never infers admin access from a non-boolean flag', async () => {
    fetchMock.mockResolvedValue(successResponse({ hasAdminAccess: 'yes', role: 'admin' }).response);

    await expect(readLoginSession()).resolves.toEqual({ hasAdminAccess: false, role: 'admin' });
  });

  it('propagates a rejected request to the caller', async () => {
    const failure = new Error('Synthetic network failure');
    fetchMock.mockRejectedValue(failure);

    await expect(readLoginSession()).rejects.toBe(failure);
  });

  it('limits both real browser attempts without a third probe', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(denialResponse(429).response);

      const pending = resolveAuthenticatedRole();
      await vi.advanceTimersByTimeAsync(249);
      expect(fetchMock).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);

      await expect(pending).resolves.toEqual({ hasAdminAccess: false, timedOut: true });
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates an unreadable success body to the caller', async () => {
    const failure = new Error('Synthetic parse failure');
    fetchMock.mockResolvedValue({
      json: vi.fn().mockRejectedValue(failure),
      ok: true,
      status: 200,
    } as unknown as Response);

    await expect(readLoginSession()).rejects.toBe(failure);
  });
});
