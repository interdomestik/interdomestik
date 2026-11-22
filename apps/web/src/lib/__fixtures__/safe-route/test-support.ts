import { authorizedSession, STAFF_A } from '@/test/safe-action-harness';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, vi } from 'vitest';

import type { ProtectedActionContext } from '../../safe-action.types';

const state = vi.hoisted(() => ({
  authorize: vi.fn(),
  limit: vi.fn(),
  values: vi.fn(),
  withTenantAuthority: vi.fn(),
  capture: vi.fn(),
  role: vi.fn<(input: unknown, ctx: ProtectedActionContext) => Promise<unknown>>(),
  body: vi.fn<(input: unknown, ctx: ProtectedActionContext) => Promise<unknown>>(),
  query: vi.fn<(input: unknown, ctx: ProtectedActionContext) => Promise<unknown>>(),
  self: vi.fn<(input: unknown, ctx: ProtectedActionContext) => Promise<unknown>>(),
  refine: vi.fn<(value: string) => unknown>(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: state.authorize }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: state.limit }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: state.withTenantAuthority,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: state.capture,
  setUser: vi.fn(),
  setTag: vi.fn(),
}));

export const mocks = state;
export const ORIGIN = 'https://app.example.test';
export const STAFF_SESSION = authorizedSession(STAFF_A);

beforeEach(() => {
  vi.stubEnv('VERCEL', undefined);
  vi.stubEnv('VERCEL_URL', undefined);
  vi.stubEnv('BETTER_AUTH_URL', ORIGIN);
  vi.stubEnv('BETTER_AUTH_TRUSTED_ORIGINS', undefined);
  mocks.authorize.mockReset().mockResolvedValue(STAFF_SESSION);
  mocks.limit.mockReset().mockResolvedValue(null);
  mocks.values.mockReset().mockResolvedValue(undefined);
  mocks.withTenantAuthority
    .mockReset()
    .mockImplementation((_authority: unknown, run: (tx: unknown) => unknown) =>
      Promise.resolve(run({ insert: () => ({ values: mocks.values }) }))
    );
  mocks.role.mockReset().mockResolvedValue('role');
  mocks.body.mockReset().mockResolvedValue('body');
  mocks.query.mockReset().mockResolvedValue('query');
  mocks.self.mockReset().mockResolvedValue('self');
  mocks.refine.mockReset().mockReturnValue(true);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

export function request({
  search = '',
  ...options
}: Pick<RequestInit, 'body' | 'headers' | 'method'> & {
  search?: string;
} = {}): NextRequest {
  const headers = new Headers({
    Origin: ORIGIN,
    'Sec-Fetch-Site': 'same-origin',
    'Content-Type': 'application/json',
  });
  new Headers(options.headers).forEach((value, key) => {
    if (value === '') headers.delete(key);
    else headers.set(key, value);
  });
  const url = `${ORIGIN}/fixture${search}`;
  const init = { method: 'POST', ...options, headers, duplex: 'half' as const };
  return new NextRequest(url, init);
}

export function jsonRequest(search?: string): NextRequest {
  return request({ body: '{"note":"x"}', ...(search === undefined ? {} : { search }) });
}

export const CLAIM = { params: { caseId: 'CLAIM_A' } };
export const BODY_CAP = 12;

export async function expectResponse(response: Response, status: number, code?: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  if (code) expect(await response.json()).toMatchObject({ success: false, code });
}

export function expectAudit(
  authorized: {
    authority: TenantAuthority;
    session: { user: { id: string; role: string | null; tenantId: string } };
  },
  operation: string,
  code: string,
  basis: 'role' | 'self',
  subject: { type: string; id?: string }
) {
  expect(mocks.withTenantAuthority).toHaveBeenCalledTimes(1);
  expect(mocks.withTenantAuthority.mock.calls[0][0]).toBe(authorized.authority);
  expect(mocks.values).toHaveBeenCalledTimes(1);
  expect(mocks.values.mock.calls[0][0]).toMatchObject({
    action: 'action.refused',
    entityType: 'server_action',
    entityId: operation,
    tenantId: authorized.session.user.tenantId,
    actorId: authorized.session.user.id,
    actorRole: authorized.session.user.role,
    metadata: { code, basis, subject },
  });
}
