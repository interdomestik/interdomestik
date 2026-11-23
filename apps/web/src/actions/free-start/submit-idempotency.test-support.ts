import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { afterEach, beforeEach, expect, vi } from 'vitest';

// Core-specific adapter integration: real submit core, real idempotency helper and real
// reservation storage over the shared mock database boundary. The mock simulates the global
// (action, idempotency_key) unique conflict and scope-filtered lookups only; it does NOT prove
// real SQL, RLS policy evaluation, role grants or actual concurrency.
const mockCaptureException = vi.fn();
const mockRateLimit = vi.fn();

vi.mock('@interdomestik/database', async () =>
  (await import('@/lib/commercial-action-idempotency-test-support')).databaseModuleMock()
);

vi.mock('@/lib/tenant/public-intake-admission', () => ({
  authorizeOpenPublicIntake: async (tenantId: string) => mintTestTenantAuthority(tenantId),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import {
  dbEntry,
  insertValues,
  resetCommercialActionMocks,
  returning,
  selectLimit,
  selectWhere,
  tenantContexts,
} from '@/lib/commercial-action-idempotency-test-support';

import { submitFreeStartIntakeCore } from './submit.core';
import type { RequestCase } from './submit-idempotency-fixtures';

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
    requestHeaders: new Headers({ host: 'ks.127.0.0.1.nip.io' }),
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
  // Every storage statement runs under the public-site authority of the shared KS partition.
  expect(tenantContexts.map(context => readTenantAuthority(context as never).tenantId)).toEqual(
    Array.from({ length: statements }, () => 'tenant_ks')
  );
  for (const entry of Object.values(dbEntry)) expect(entry).not.toHaveBeenCalled();
}

export function installReservationHooks() {
  beforeEach(() => {
    resetStorage();
    vi.stubEnv('DATABASE_URL', 'postgresql://fixture@localhost:5432/test');
    vi.stubEnv('DATABASE_URL_RLS', 'postgresql://fixture@localhost:5432/test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
}

export {
  captureFingerprintHash,
  expectOwnTenantStorageOnly,
  FOREIGN_PAYLOAD,
  KEY,
  mockCaptureException,
  mockRateLimit,
  seedExistingRow,
  storedRow,
  submit,
  submitVia,
  successDto,
  validInput,
};
