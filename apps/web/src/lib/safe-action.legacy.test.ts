import { MissingTenantError, UnauthorizedError } from '@interdomestik/shared-auth/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authorizedSession, MEMBER_A } from '@/test/safe-action-harness';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), write: vi.fn(), capture: vi.fn() }));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.capture,
  setUser: vi.fn(),
  setTag: vi.fn(),
}));
vi.mock('next/navigation', async importOriginal => importOriginal());

import { notFound } from 'next/navigation';
import { runAuthenticatedAction } from './safe-action';

function thrown(error: unknown) {
  // The wrapper awaits the handler inside its try, so a synchronous throw takes the same path.
  return runAuthenticatedAction(() => {
    throw error;
  });
}

function coded(name: string, code: string, message = 'denied') {
  return Object.assign(new Error(message), { name, code });
}

describe('runAuthenticatedAction (legacy) classification, design §4', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.write.mockResolvedValue({ ok: true });
    mocks.authorize.mockResolvedValue(authorizedSession(MEMBER_A));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('a typed UnauthorizedError is a refusal, recorded with operation legacy', async () => {
    expect(await thrown(new UnauthorizedError('Unauthorized'))).toEqual({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Unauthorized',
    });
    expect(mocks.write).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'legacy',
        metadata: { code: 'UNAUTHORIZED', basis: 'legacy', subject: { type: 'unknown' } },
      })
    );
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('no longer matches text: a plain Error("Unauthorized") is an internal failure', async () => {
    expect(await thrown(new Error('Unauthorized'))).toEqual({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      error: 'Internal Server Error',
    });
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('a provider error is never a refusal, whatever its code', async () => {
    expect(await thrown(coded('APIError', 'UNAUTHORIZED'))).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(await thrown(coded('PostgresError', 'FORBIDDEN'))).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('a FORBIDDEN-like code outside the refusal list is not a refusal', async () => {
    expect(await thrown(coded('Error', 'FORBIDDEN_SOMETHING'))).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('a coded plain Error with a refusal code stays a refusal (permissions.core)', async () => {
    expect(await thrown(coded('Error', 'FORBIDDEN_SCOPE_MISMATCH', 'scope'))).toEqual({
      success: false,
      code: 'FORBIDDEN_SCOPE_MISMATCH',
      error: 'scope',
    });
  });

  it('AccessDeniedError without a code is UNAUTHORIZED', async () => {
    const error = Object.assign(new Error('no'), { name: 'AccessDeniedError' });
    expect(await thrown(error)).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('MissingTenantError keeps the fixed message', async () => {
    expect(await thrown(new MissingTenantError('detail'))).toEqual({
      success: false,
      code: 'MISSING_TENANT',
      error: 'Missing tenant context',
    });
  });

  it('rethrows notFound and a bare NEXT_REDIRECT', async () => {
    await expect(runAuthenticatedAction(() => Promise.resolve(notFound()))).rejects.toThrow();
    await expect(thrown(new Error('NEXT_REDIRECT'))).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('a nested framework error is rethrown through its cause', async () => {
    let control: unknown;
    try {
      notFound();
    } catch (error) {
      control = error;
    }
    await expect(thrown(new Error('wrapped', { cause: control }))).rejects.toBeDefined();
  });

  it('keeps the duck-typed pass-through and records a passed-through refusal', async () => {
    const passed = { success: false, error: 'Nope', code: 'FORBIDDEN' };
    expect(await runAuthenticatedAction(() => Promise.resolve(passed))).toBe(passed);
    expect(mocks.write).toHaveBeenCalledTimes(1);
    const ok = { success: true, data: 1 };
    expect(await runAuthenticatedAction(() => Promise.resolve(ok))).toBe(ok);
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
});
