import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
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

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
const open = vi.fn();

vi.mock('@/lib/tenant/public-intake-admission', () => ({
  authorizeOpenPublicIntake: (tenantId: string) => open(tenantId),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// The reservation scope carries the public-site authority of the host partition, never a raw id.
function tenantScope(tenantId: string) {
  return {
    kind: 'tenant',
    authority: expect.toSatisfy(
      (authority: unknown) => readTenantAuthority(authority as never).tenantId === tenantId
    ),
    actorUserId: null,
  };
}

const KS = 'ks.127.0.0.1.nip.io';
const MK = 'mk.127.0.0.1.nip.io';
const IDA = 'ida.127.0.0.1.nip.io';
const SCOPE_CASES = [
  { name: 'KS exact host over default and hints', host: KS, tenantId: 'tenant_ks' },
  { name: 'MK exact host over default and hints', host: MK, tenantId: 'tenant_mk' },
  { name: 'door configured default', host: IDA, tenantId: 'tenant_mk' },
];

describe('actions/free-start submitFreeStartIntakeCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunCommercialActionWithIdempotency.mockImplementation(async ({ execute }) => execute());
    open.mockImplementation(async tenantId => mintTestTenantAuthority(tenantId));
    vi.stubEnv('DATABASE_URL', 'postgresql://fixture@localhost:5432/test');
    vi.stubEnv('DATABASE_URL_RLS', 'postgresql://fixture@localhost:5432/test');
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_mk');
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
      requestHeaders: new Headers({ host: KS }),
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
        scope: tenantScope('tenant_ks'),
        idempotencyKey: 'free-start-1',
        requestFingerprint: validInput,
      })
    );
  });

  it.each(SCOPE_CASES)(
    'partitions keyed reservations by request host only: $name',
    async ({ host, tenantId }) => {
      mockRateLimit.mockResolvedValueOnce({ limited: false });

      const result = await submitFreeStartIntakeCore({
        idempotencyKey: 'free-start-scope',
        requestHeaders: new Headers({
          host,
          'x-tenant-id': 'tenant_al',
          cookie: 'tenantId=tenant_al',
        }),
        data: validInput,
      });

      expect(result).toMatchObject({ success: true });
      expect(mockRunCommercialActionWithIdempotency).toHaveBeenCalledWith(
        expect.objectContaining({ scope: tenantScope(tenantId) })
      );
    }
  );

  it.each([
    { host: KS, 'x-forwarded-host': MK },
    { host: KS, 'x-forwarded-host': '' },
    { host: 'unknown.example' },
    { 'x-forwarded-host': KS },
  ])('closes before checking a tenant or reserving for %j', async input => {
    const result = await submitFreeStartIntakeCore({
      idempotencyKey: 'free-start-closed',
      requestHeaders: new Headers(
        Object.entries(input).filter(
          (pair): pair is [string, string] => typeof pair[1] === 'string'
        )
      ),
      data: validInput,
    });
    expect(result).toMatchObject({ success: false, code: 'CLOSED' });
    expect(open).not.toHaveBeenCalled();
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockRunCommercialActionWithIdempotency).not.toHaveBeenCalled();
  });

  it.each(['tenant_al', 'pilot-mk', ''])(
    'closes the door for a noncanonical partition %s',
    async tenant => {
      vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', tenant);
      await expect(
        submitFreeStartIntakeCore({
          requestHeaders: new Headers({ host: IDA }),
          data: validInput,
        })
      ).resolves.toMatchObject({ success: false, code: 'CLOSED' });
      expect(open).not.toHaveBeenCalled();
      expect(mockRunCommercialActionWithIdempotency).not.toHaveBeenCalled();
    }
  );

  it('returns CLOSED on a recognized closed tenant before parsing, limiting or reserving', async () => {
    open.mockResolvedValueOnce(null);
    const data = {
      ...validInput,
      get summary(): string {
        throw new Error('input parsed');
      },
    };
    await expect(
      submitFreeStartIntakeCore({
        idempotencyKey: 'closed',
        requestHeaders: new Headers({ host: KS }),
        data,
      })
    ).resolves.toMatchObject({ success: false, code: 'CLOSED' });
    expect(open).toHaveBeenCalledWith('tenant_ks');
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockRunCommercialActionWithIdempotency).not.toHaveBeenCalled();
  });

  it('rejects issue types that do not match the selected category', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });

    const result = await submitFreeStartIntakeCore({
      requestHeaders: new Headers({ host: KS }),
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
      requestHeaders: new Headers({ host: KS }),
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
      requestHeaders: new Headers({ host: KS }),
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
