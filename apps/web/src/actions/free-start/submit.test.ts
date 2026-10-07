import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { submitFreeStartIntakeCore } from './submit.core';

const mockCaptureException = vi.fn();
const mockRateLimit = vi.fn();
const mockRunCommercialActionWithIdempotency = vi.fn();

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock('@/lib/commercial-action-idempotency', () => ({
  runCommercialActionWithIdempotency: (...args: unknown[]) =>
    mockRunCommercialActionWithIdempotency(...args),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// Configuration read by the real tenant resolver; stubbed empty per test and restored after.
const TENANT_HOST_ENV = [
  'DEFAULT_PUBLIC_TENANT_ID',
  'IDA_HOST',
  'VERCEL_URL',
  'KS_HOST',
  'MK_HOST',
  'AL_HOST',
  'PILOT_HOST',
] as const;

// Client tenant/country hints. Outside production the real resolver honours cookie and
// x-tenant-id hints when a caller passes them, so these cases discriminate.
const HOSTILE_HINTS = {
  'x-tenant-id': 'tenant_mk',
  cookie: 'tenantId=tenant_mk',
  'x-vercel-ip-country': 'MK',
  'accept-language': 'mk',
};
const KS = 'ks.interdomestik.com';
const MK = 'mk.interdomestik.com';
const IDA = 'ida.interdomestik.com';
const UNKNOWN = 'unknown.example';

type ScopeCase = { name: string; headers: Record<string, string>; tenantId: string; env: string };

function scopeCase(
  name: string,
  headers: Record<string, string>,
  tenantId: string,
  env = ''
): ScopeCase {
  return { name, headers, tenantId, env };
}

const SCOPE_CASES: readonly ScopeCase[] = [
  scopeCase('KS canonical host over default', { host: KS }, 'tenant_ks', 'tenant_al'),
  scopeCase('KS local alias with port', { host: 'ks.localhost:3000' }, 'tenant_ks'),
  scopeCase('MK canonical host', { host: MK }, 'tenant_mk'),
  scopeCase('MK nip.io alias', { host: 'mk.127.0.0.1.nip.io' }, 'tenant_mk'),
  scopeCase('neutral host, configured default', { host: IDA }, 'tenant_mk', 'tenant_mk'),
  scopeCase('neutral host, no configured default', { host: IDA }, 'tenant_ks'),
  scopeCase('missing host, configured default', {}, 'tenant_al', 'tenant_al'),
  scopeCase('unknown host, configured default', { host: UNKNOWN }, 'tenant_al', 'tenant_al'),
  scopeCase('unknown host, unrecognised default', { host: UNKNOWN }, 'tenant_ks', 'tenant_x'),
  scopeCase('forwarded host over host', { 'x-forwarded-host': MK, host: KS }, 'tenant_mk'),
  scopeCase(
    'empty forwarded host never falls back to host',
    { 'x-forwarded-host': '', host: MK },
    'tenant_al',
    'tenant_al'
  ),
  scopeCase('hints ignored on unknown host', { ...HOSTILE_HINTS, host: UNKNOWN }, 'tenant_ks'),
  scopeCase('hints ignored on neutral host', { ...HOSTILE_HINTS, host: IDA }, 'tenant_ks'),
  scopeCase('hints cannot override host', { ...HOSTILE_HINTS, host: KS }, 'tenant_ks'),
];

describe('actions/free-start submitFreeStartIntakeCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunCommercialActionWithIdempotency.mockImplementation(async ({ execute }) => execute());
    for (const name of TENANT_HOST_ENV) vi.stubEnv(name, '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const validInput = {
    category: 'property',
    counterparty: 'Building insurer',
    desiredOutcome: 'repair',
    incidentDate: '2026-03-01',
    issueType: 'water_damage',
    summary: 'Water entered through the roof after a storm and damaged two rooms.',
  } as const;

  it('returns validated commercial intake payload on success', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });

    const result = await submitFreeStartIntakeCore({
      idempotencyKey: 'free-start-1',
      requestHeaders: new Headers(),
      data: validInput,
    });

    expect(result).toEqual({
      success: true,
      data: {
        claimCategory: 'property',
        desiredOutcome: 'repair',
        intakeIssue: 'water_damage',
      },
    });
    expect(mockRunCommercialActionWithIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'free-start.submit',
        scope: {
          kind: 'tenant',
          tenantId: 'tenant_ks',
          actorUserId: null,
        },
        idempotencyKey: 'free-start-1',
        requestFingerprint: validInput,
      })
    );
  });

  it.each(SCOPE_CASES)(
    'partitions keyed reservations by request host only: $name',
    async ({ headers, tenantId, env }) => {
      vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', env);
      mockRateLimit.mockResolvedValueOnce({ limited: false });

      const result = await submitFreeStartIntakeCore({
        idempotencyKey: 'free-start-scope',
        requestHeaders: new Headers(headers),
        data: validInput,
      });

      expect(result).toMatchObject({ success: true });
      expect(mockRunCommercialActionWithIdempotency).toHaveBeenCalledWith(
        expect.objectContaining({ scope: { kind: 'tenant', tenantId, actorUserId: null } })
      );
    }
  );

  it('rejects issue types that do not match the selected category', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });

    const result = await submitFreeStartIntakeCore({
      requestHeaders: new Headers(),
      data: {
        ...validInput,
        category: 'vehicle',
      },
    });

    expect(result).toEqual({
      success: false,
      error: 'Validation failed',
      code: 'INVALID_PAYLOAD',
      issues: {
        issueType: 'Issue type must match the selected category.',
      },
    });
  });

  it('returns a rate-limit error when submission is throttled', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: true });

    const result = await submitFreeStartIntakeCore({
      requestHeaders: new Headers(),
      data: validInput,
    });

    expect(result).toEqual({
      success: false,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
    });
  });

  it('captures idempotency execution failures and returns an internal error', async () => {
    const failure = new Error('idempotency exploded');
    mockRunCommercialActionWithIdempotency.mockRejectedValueOnce(failure);

    const result = await submitFreeStartIntakeCore({
      requestHeaders: new Headers(),
      data: validInput,
    });

    expect(result).toEqual({
      success: false,
      error: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        tags: {
          action: 'submitFreeStartIntake',
          feature: 'free-start',
        },
      })
    );
  });
});
