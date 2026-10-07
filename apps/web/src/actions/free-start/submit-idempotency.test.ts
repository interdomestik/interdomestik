import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Core-specific adapter integration: real submit core, real idempotency helper and real
// reservation storage over the shared mock database boundary. The mock simulates the global
// (action, idempotency_key) unique conflict and scope-filtered lookups only; it does NOT prove
// real SQL, RLS policy evaluation, role grants or actual concurrency.
const mockCaptureException = vi.fn();
const mockRateLimit = vi.fn();

vi.mock('@interdomestik/database', async () =>
  (await import('@/lib/commercial-action-idempotency-test-support')).databaseModuleMock()
);

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import {
  dbEntry,
  deleteWhere,
  insertValues,
  resetCommercialActionMocks,
  returning,
  selectLimit,
  selectWhere,
  tenantContexts,
  txEntry,
  updateSet,
  withTenantContextMock,
} from '@/lib/commercial-action-idempotency-test-support';

import { submitFreeStartIntakeCore } from './submit.core';
import { REQUEST_CASES, viaEachRequest, type RequestCase } from './submit-idempotency-fixtures';

type StoredRow = Record<string, unknown>;
type Predicate = [op: string, column: string, value?: unknown];

const KEY = 'free-start-key-1';
const FOREIGN_PAYLOAD = { success: true, data: { claimCategory: 'foreign-secret' } };
const validInput = {
  category: 'property',
  counterparty: 'Building insurer',
  desiredOutcome: 'repair',
  incidentDate: '2026-03-01',
  issueType: 'water_damage',
  summary: 'Water entered through the roof after a storm and damaged two rooms.',
} as const;
const successDto = {
  success: true,
  data: { claimCategory: 'property', desiredOutcome: 'repair', intakeIssue: 'water_damage' },
};

function submit(overrides: Partial<Parameters<typeof submitFreeStartIntakeCore>[0]> = {}) {
  return submitFreeStartIntakeCore({
    idempotencyKey: KEY,
    requestHeaders: new Headers({ host: 'ks.interdomestik.com' }),
    data: validInput,
    ...overrides,
  });
}

function submitVia(request: RequestCase) {
  vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', request.defaultTenant);
  return submit({ requestHeaders: new Headers(request.headers) });
}

function resetStorage(): void {
  resetCommercialActionMocks();
  mockRateLimit.mockResolvedValue({ limited: false });
}

async function captureFingerprintHash(): Promise<string> {
  await submit();
  const [values] = insertValues.mock.calls[0] as [{ requestFingerprintHash: string }];
  resetStorage();
  return values.requestFingerprintHash;
}

function storedRow(overrides: StoredRow): StoredRow {
  return {
    id_col: 'idem_existing',
    action_col: 'free-start.submit',
    idempotency_key_col: KEY,
    tenant_id_col: 'tenant_ks',
    actor_user_id_col: null,
    request_fingerprint_hash_col: 'unset',
    response_payload_col: successDto,
    status_col: 'completed',
    ...overrides,
  };
}

function rowMatches(row: StoredRow, where: unknown): boolean {
  const [, ...predicates] = where as [string, ...Predicate[]];
  return predicates.every(([op, column, value]) =>
    op === 'isNull' ? row[column] === null : row[column] === value
  );
}

// Global unique conflict: the insert returns nothing and the scoped lookup sees the row only
// when every scope predicate emitted by the storage layer matches it.
function seedExistingRow(row: StoredRow): void {
  returning.mockResolvedValueOnce([]);
  selectWhere.mockImplementationOnce((where: unknown) => {
    const reservation = {
      id: row.id_col,
      requestFingerprintHash: row.request_fingerprint_hash_col,
      responsePayload: row.response_payload_col,
      status: row.status_col,
    };
    selectLimit.mockResolvedValueOnce(rowMatches(row, where) ? [reservation] : []);
    return { limit: selectLimit };
  });
}

function expectOwnTenantStorageOnly(statements: number): void {
  expect(tenantContexts).toEqual(
    Array.from({ length: statements }, () => ({ tenantId: 'tenant_ks' }))
  );
  for (const entry of Object.values(dbEntry)) expect(entry).not.toHaveBeenCalled();
}

describe('submitFreeStartIntakeCore keyed reservation adapter', () => {
  beforeEach(() => {
    resetStorage();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(REQUEST_CASES)(
    'reserves a fresh key in the technical partition with a null actor via $name',
    async request => {
      await expect(submitVia(request)).resolves.toEqual(successDto);

      expect(mockRateLimit).toHaveBeenCalledTimes(1);
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'free-start.submit',
          idempotencyKey: KEY,
          tenantId: 'tenant_ks',
          actorUserId: null,
          status: 'pending',
        })
      );
      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ responsePayload: successDto, status: 'completed' })
      );
      expect(txEntry.insert).toHaveBeenCalledTimes(1);
      expect(txEntry.update).toHaveBeenCalledTimes(1);
      expectOwnTenantStorageOnly(2);
    }
  );

  it.each(REQUEST_CASES)(
    'replays a completed same-fingerprint shared-partition reservation via $name',
    async request => {
      const hash = await captureFingerprintHash();
      const cached = { ...successDto, data: { ...successDto.data, intakeIssue: 'cached_issue' } };
      seedExistingRow(
        storedRow({ request_fingerprint_hash_col: hash, response_payload_col: cached })
      );

      await expect(submitVia(request)).resolves.toEqual(cached);

      expect(mockRateLimit).not.toHaveBeenCalled();
      expect(selectWhere).toHaveBeenCalledWith(
        expect.arrayContaining([
          ['eq', 'tenant_id_col', 'tenant_ks'],
          ['isNull', 'actor_user_id_col'],
        ])
      );
      expect(updateSet).not.toHaveBeenCalled();
      expectOwnTenantStorageOnly(2);
    }
  );

  it.each(
    viaEachRequest([
      {
        name: 'a changed-fingerprint',
        row: { request_fingerprint_hash_col: 'changed-hash' },
        code: 'IDEMPOTENCY_KEY_REUSED',
      },
      {
        name: 'a pending same-fingerprint',
        row: { status_col: 'pending', response_payload_col: {} },
        code: 'IDEMPOTENCY_IN_PROGRESS',
      },
    ])
  )(
    'neither executes nor releases payload for $name reservation via $via',
    async ({ row, code, request }) => {
      const hash = await captureFingerprintHash();
      seedExistingRow(storedRow({ request_fingerprint_hash_col: hash, ...row }));

      const result = await submitVia(request);

      expect(result).toEqual(expect.objectContaining({ success: false, code }));
      expect(result).not.toHaveProperty('data');
      expect(mockRateLimit).not.toHaveBeenCalled();
      expect(updateSet).not.toHaveBeenCalled();
      expect(deleteWhere).not.toHaveBeenCalled();
      expectOwnTenantStorageOnly(2);
    }
  );

  it.each(
    viaEachRequest([
      { name: 'foreign MK-tenant', foreign: { tenant_id_col: 'tenant_mk' } },
      { name: 'foreign AL-tenant', foreign: { tenant_id_col: 'tenant_al' } },
      { name: 'foreign pilot-tenant', foreign: { tenant_id_col: 'pilot-mk' } },
      { name: 'foreign-actor', foreign: { actor_user_id_col: 'user-foreign' } },
      { name: 'legacy null-tenant public', foreign: { tenant_id_col: null } },
    ])
  )(
    'fails closed on a $name reservation holding the global key via $via',
    async ({ foreign, request }) => {
      const hash = await captureFingerprintHash();
      const row = storedRow({ request_fingerprint_hash_col: hash, ...foreign });
      seedExistingRow({ ...row, response_payload_col: FOREIGN_PAYLOAD });

      await expect(submitVia(request)).resolves.toEqual({
        success: false,
        error: 'Idempotency key is already reserved for a different scope.',
        code: 'IDEMPOTENCY_SCOPE_CONFLICT',
      });

      expect(mockRateLimit).not.toHaveBeenCalled();
      expect(updateSet).not.toHaveBeenCalled();
      expect(deleteWhere).not.toHaveBeenCalled();
      expectOwnTenantStorageOnly(2);
    }
  );

  it.each([
    { name: 'rate-limit', limited: true, data: validInput, code: 'RATE_LIMITED' },
    {
      name: 'validation',
      limited: false,
      data: { ...validInput, category: 'vehicle' as const },
      code: 'INVALID_PAYLOAD',
    },
  ])(
    'releases only its own reservation on an explicit $name failure',
    async ({ limited, data, code }) => {
      mockRateLimit.mockResolvedValueOnce({ limited });

      await expect(submit({ data })).resolves.toMatchObject({ success: false, code });

      expect(txEntry.delete).toHaveBeenCalledTimes(1);
      expect(deleteWhere).toHaveBeenCalledWith(['eq', 'id_col', 'idem_1']);
      expect(updateSet).not.toHaveBeenCalled();
      expectOwnTenantStorageOnly(2);
    }
  );

  it('releases only its own reservation when execution throws', async () => {
    const failure = new Error('limiter unavailable');
    mockRateLimit.mockRejectedValueOnce(failure);

    await expect(submit()).resolves.toEqual({
      success: false,
      error: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
    });

    expect(deleteWhere).toHaveBeenCalledWith(['eq', 'id_col', 'idem_1']);
    expect(updateSet).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        tags: { action: 'submitFreeStartIntake', feature: 'free-start' },
      })
    );
    expectOwnTenantStorageOnly(2);
  });

  it('bypasses reservation storage entirely without an idempotency key', async () => {
    await expect(submit({ idempotencyKey: undefined })).resolves.toEqual(successDto);

    expect(mockRateLimit).toHaveBeenCalledTimes(1);
    expect(withTenantContextMock).not.toHaveBeenCalled();
    expect(txEntry.insert).not.toHaveBeenCalled();
    expectOwnTenantStorageOnly(0);
  });
});
