// @vitest-environment node
import { MissingTenantError } from '@interdomestik/shared-auth';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { expect, it, vi } from 'vitest';

import {
  authorizedSession,
  MANAGER_NO_BRANCH,
  MEMBER_A,
  STAFF_A,
} from '@/test/safe-action-harness';

import {
  CLAIM,
  expectAudit,
  expectResponse,
  jsonRequest,
  mocks,
  ORIGIN,
  request,
  STAFF_SESSION,
} from './__fixtures__/safe-route/test-support';
import { POST } from './__fixtures__/safe-route/role.fixture';
import { POST as bodyPost } from './__fixtures__/safe-route/body.fixture';
import { POST as queryPost } from './__fixtures__/safe-route/query.fixture';
import { POST as selfPost } from './__fixtures__/safe-route/self.fixture';
import { actionFailure } from './safe-action.failure';

const from = (host: string) =>
  request({ body: '{"note":"x"}', headers: { Origin: `https://${host}` } });

it.each([
  ['anonymous', 401, 'UNAUTHORIZED'],
  ['missing tenant', 403, 'MISSING_TENANT'],
] as const)(
  'refuses %s without reading params or writing an audit row',
  async (kind, status, code) => {
    if (kind === 'anonymous') mocks.authorize.mockResolvedValueOnce(null);
    else mocks.authorize.mockRejectedValueOnce(new MissingTenantError('private detail'));
    const get = vi.fn(() => CLAIM.params);
    const context = Object.defineProperty({}, 'params', { get });

    await expectResponse(await POST(jsonRequest(), context), status, code);

    expect(get).toHaveBeenCalledTimes(0);
    expect(mocks.role).toHaveBeenCalledTimes(0);
    expect(mocks.values).toHaveBeenCalledTimes(0);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[SafeAction] refused', {
      operation: 'fixtures.role',
      code,
      basis: 'role',
      subjectType: 'claim',
    });
  }
);

it.each([
  [MEMBER_A, 'FORBIDDEN'],
  [MANAGER_NO_BRANCH, 'FORBIDDEN_NO_BRANCH'],
] as const)(
  'audits a tenant-backed refusal for $id against the submitted params',
  async (user, code) => {
    const caller = authorizedSession(user);
    mocks.authorize.mockResolvedValueOnce(caller);

    await expectResponse(
      await POST(request({ body: 'malformed' }), {
        params: Promise.resolve(CLAIM.params),
      }),
      403,
      code
    );

    expectAudit(caller, 'fixtures.role', code, 'role', { type: 'claim', id: 'CLAIM_A' });
    expect(mocks.role).toHaveBeenCalledTimes(0);
    expect(mocks.refine).toHaveBeenCalledTimes(0);
  }
);

it('reads the query subject alone before the basis denial and leaves params untouched', async () => {
  const caller = authorizedSession(MEMBER_A);
  mocks.authorize.mockResolvedValueOnce(caller);
  const pending = new Promise<never>(() => undefined);
  const get = vi.fn(() => pending);
  const context = Object.defineProperty({}, 'params', { get });

  const response = await queryPost(
    request({ search: '?caseId=CASE_A&term=one&term=two' }),
    context
  );

  await expectResponse(response, 403, 'FORBIDDEN');
  expectAudit(caller, 'fixtures.query', 'FORBIDDEN', 'role', { type: 'claim', id: 'CASE_A' });
  expect(get).toHaveBeenCalledTimes(0);
  expect(mocks.query).toHaveBeenCalledTimes(0);
});

it('records an ambiguous query subject as unknown', async () => {
  const caller = authorizedSession(MEMBER_A);
  mocks.authorize.mockResolvedValueOnce(caller);

  await expectResponse(
    await queryPost(request({ search: '?caseId=a&caseId=b' }), {}),
    403,
    'FORBIDDEN'
  );

  expectAudit(caller, 'fixtures.query', 'FORBIDDEN', 'role', { type: 'claim', id: 'unknown' });
  expect(mocks.query).toHaveBeenCalledTimes(0);
});

it.each([
  [false, 403, 'FORBIDDEN_SCOPE_MISMATCH'],
  [true, 404, 'NOT_FOUND'],
] as const)(
  'uses the self command refusal with concealment=%s and audits the true code',
  async (conceal, status, code) => {
    const caller = authorizedSession(MEMBER_A);
    mocks.authorize.mockResolvedValueOnce(caller);
    const refused = 'FORBIDDEN_SCOPE_MISMATCH';
    mocks.self.mockResolvedValueOnce(
      actionFailure(refused, 'private command detail', conceal ? { conceal: 'NOT_FOUND' } : {})
    );

    const response = await selfPost(jsonRequest(), {});
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      success: false,
      code,
      error: conceal ? 'Not found' : 'Request failed',
    });

    expectAudit(caller, 'fixtures.self', refused, 'self', { type: 'self', id: MEMBER_A.id });
    expect(mocks.self).toHaveBeenCalledTimes(1);
  }
);

it('returns only the session authority and session in handler context', async () => {
  const req = request({ search: '?term=other-query', body: '{"note":"other-body"}' });
  await expectResponse(await POST(req, { params: { caseId: 'other-params' } }), 200);

  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(req.headers);
  expect(mocks.role).toHaveBeenCalledTimes(1);
  expect(mocks.role.mock.calls[0][0]).toEqual({
    params: { caseId: 'other-params' },
    query: { term: 'other-query' },
    body: { note: 'other-body' },
  });
  const ctx = mocks.role.mock.calls[0][1];
  expect(ctx.session).toBe(STAFF_SESSION.session);
  expect(ctx.authority).toBe(STAFF_SESSION.authority);
  expect(ctx.tenantId).toBe(STAFF_A.tenantId);
  expect(ctx.requestHeaders).toBe(req.headers);
  expect(mocks.values).toHaveBeenCalledTimes(0);
});

it('refuses tenant B when the self command checks the authority tenant', async () => {
  const caller = authorizedSession({ ...MEMBER_A, id: 'member-b', tenantId: 'tenant-b' });
  mocks.authorize.mockResolvedValueOnce(caller);
  mocks.self.mockImplementationOnce(async (_input, ctx) =>
    readTenantAuthority(ctx.authority).tenantId === MEMBER_A.tenantId
      ? 'changed'
      : actionFailure('FORBIDDEN', undefined, { reason: 'cross_tenant' })
  );

  await expectResponse(await selfPost(jsonRequest(), {}), 403, 'FORBIDDEN');

  expectAudit(caller, 'fixtures.self', 'FORBIDDEN', 'self', { type: 'self', id: 'member-b' });
  expect(mocks.values.mock.calls[0][0].metadata.reason).toBe('cross_tenant');
  expect(mocks.self).toHaveBeenCalledTimes(1);
});

it.each(['GET', 'HEAD', 'OPTIONS', 'PATCH'])(
  'returns 405 for %s before any other gate',
  async method => {
    const response = await POST(
      request({ method, headers: { 'Sec-Fetch-Site': 'cross-site' } }),
      {}
    );
    await expectResponse(response, 405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(mocks.limit).toHaveBeenCalledTimes(0);
    expect(mocks.authorize).toHaveBeenCalledTimes(0);
    expect(mocks.role).toHaveBeenCalledTimes(0);
  }
);

it.each([
  { Origin: '' },
  { Origin: 'null' },
  { Origin: 'https://foreign.example.test' },
  { Origin: `${ORIGIN}/path` },
  { Origin: `${ORIGIN}/` },
  { Origin: ORIGIN.replace('https', 'HTTPS') },
  { Origin: `${ORIGIN}, ${ORIGIN}` },
  { 'Sec-Fetch-Site': '' },
  { 'Sec-Fetch-Site': 'cross-site' },
  { 'Sec-Fetch-Site': 'same-site' },
  { 'Sec-Fetch-Site': 'none' },
])('refuses POST with headers %j before the limiter and session', async headers => {
  const req = request({ body: '{"note":"x"}', headers: new Headers(Object.entries(headers)) });
  await expectResponse(await POST(req, CLAIM), 403, 'FORBIDDEN');

  expect(mocks.limit).toHaveBeenCalledTimes(0);
  expect(mocks.authorize).toHaveBeenCalledTimes(0);
  expect(mocks.role).toHaveBeenCalledTimes(0);
  expect(mocks.values).toHaveBeenCalledTimes(0);
});

it.each([
  ['preview', 'staging.interdomestik.com', 'ida.interdomestik.com'],
  ['production', 'ida.interdomestik.com', 'staging.interdomestik.com'],
])('trusts only the hosted %s origin', async (environment, accepted, denied) => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', environment);
  vi.stubEnv('VERCEL_TARGET_ENV', environment);

  await expectResponse(await bodyPost(from(denied), {}), 403, 'FORBIDDEN');
  expect(mocks.authorize).toHaveBeenCalledTimes(0);
  expect(mocks.body).toHaveBeenCalledTimes(0);

  await expectResponse(await bodyPost(from(accepted), {}), 200);
  expect(mocks.authorize).toHaveBeenCalledTimes(1);
  expect(mocks.body).toHaveBeenCalledTimes(1);
});

it('fails closed on malformed hosted trust configuration before calling the session', async () => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('BETTER_AUTH_TRUSTED_ORIGINS', 'https://ida.interdomestik.com/path');

  await expectResponse(await POST(jsonRequest(), CLAIM), 500, 'INTERNAL_SERVER_ERROR');
  expect(mocks.authorize).toHaveBeenCalledTimes(0);
  expect(mocks.limit).toHaveBeenCalledTimes(0);
  expect(mocks.role).toHaveBeenCalledTimes(0);
});

it.each([
  [429, 'RATE_LIMITED', 'Too many requests'],
  [503, 'SERVICE_UNAVAILABLE', 'Service unavailable'],
] as const)(
  'answers limiter status %s before the session with Retry-After',
  async (status, code, error) => {
    mocks.limit.mockResolvedValueOnce(
      new Response('private backend details', { status, headers: { 'Retry-After': '17' } })
    );
    const req = jsonRequest();

    const response = await POST(req, CLAIM);
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('17');
    expect(await response.json()).toEqual({ success: false, code, error });
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith({
      name: 'route:fixtures.role',
      limit: 4,
      windowSeconds: 30,
      headers: req.headers,
      productionSensitive: true,
      contentFreeTelemetry: true,
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(0);
    expect(mocks.role).toHaveBeenCalledTimes(0);
    expect(mocks.values).toHaveBeenCalledTimes(0);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[SafeRoute] limited', {
      operation: 'fixtures.role',
      code,
      basis: 'role',
      subjectType: 'claim',
    });
  }
);
