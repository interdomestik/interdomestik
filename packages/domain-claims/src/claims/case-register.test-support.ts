import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type {
  TenantAuthority,
  TenantAuthorityDescriptor,
} from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, vi, type Mock } from 'vitest';

type Statement = {
  kind: string;
  table?: unknown;
  where?: SQL;
  conflictWhere?: SQL;
  limit?: number;
  offset?: number;
  lock?: string;
  values?: unknown;
};

const db: {
  transaction: Mock;
  descriptor: Mock<() => TenantAuthorityDescriptor>;
  results: unknown[][];
  statements: Statement[];
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  descriptor: vi.fn<() => TenantAuthorityDescriptor>(),
  results: [] as unknown[][],
  statements: [] as Statement[],
}));

export { db };

vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: db.transaction,
}));

vi.mock('@interdomestik/database/tenant-authority', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database/tenant-authority')>()),
  readTenantAuthority: db.descriptor,
}));

type Builder = Promise<unknown[]> & {
  from(table: unknown): Builder;
  innerJoin(): Builder;
  where(where: SQL): Builder;
  for(lock: string): Builder;
  set(values: unknown): Builder;
  values(values: unknown): Builder;
  orderBy(): Builder;
  limit(value: number): Builder;
  offset(value: number): Builder;
  onConflictDoNothing(): Builder;
  onConflictDoUpdate(config: { setWhere?: SQL }): Builder;
  returning(): Builder;
};

// A real promise carries the builder methods: each statement takes the next queued result in the
// order the command creates it, which is the order the sequential command code awaits it.
function statement(operation: Statement) {
  db.statements.push(operation);
  const rows = Promise.resolve().then(() => db.results.shift() ?? []);
  const query: Builder = Object.assign(rows, {
    from(table: unknown) {
      operation.table = table;
      return query;
    },
    innerJoin() {
      return query;
    },
    where(where: SQL) {
      operation.where = where;
      return query;
    },
    for(lock: string) {
      operation.lock = lock;
      return query;
    },
    set(values: unknown) {
      operation.values = values;
      return query;
    },
    values(values: unknown) {
      operation.values = values;
      return query;
    },
    orderBy() {
      return query;
    },
    limit(value: number) {
      operation.limit = value;
      return query;
    },
    offset(value: number) {
      operation.offset = value;
      return query;
    },
    onConflictDoNothing() {
      return query;
    },
    onConflictDoUpdate(config: { setWhere?: SQL }) {
      operation.conflictWhere = config.setWhere;
      return query;
    },
    returning() {
      return query;
    },
  });
  return query;
}

export const tenantId = 'tenant-1';
export const claimId = 'claim-1';
export const actorId = 'staff-1';
export const branchId = 'branch-1';
export const admitted = [{ id: claimId }];
export const authority: TenantAuthority = mintTestTenantAuthority(tenantId);

export function caller(
  role = 'staff',
  branch: string | null = branchId,
  overrides: Partial<TenantAuthorityDescriptor> = {}
) {
  db.descriptor.mockReturnValue({
    tenantId,
    accessTenantId: tenantId,
    purpose: 'session',
    principal: { userId: actorId, role, branchId: branch, agentId: null },
    expiresAtMs: Number.MAX_SAFE_INTEGER,
    ...overrides,
  });
  return { user: { id: actorId, role, branchId: branch, tenantId } };
}

beforeEach(() => {
  db.transaction.mockReset().mockImplementation((_authority, run) =>
    run({
      select: () => statement({ kind: 'select' }),
      selectDistinct: () => statement({ kind: 'selectDistinct' }),
      update: (table: unknown) => statement({ kind: 'update', table }),
      insert: (table: unknown) => statement({ kind: 'insert', table }),
    })
  );
  db.statements.length = 0;
  db.results = [admitted];
});

export function queryWhere(index: number) {
  const where = db.statements[index]?.where;
  if (!where) throw new Error('Expected SQL predicate');
  return new PgDialect().sqlToQuery(where);
}

export const ids = {
  correlation: '12345678-1234-4234-8234-123456789012',
  recovery: '12345678-1234-4234-8234-123456789013',
  representation: '12345678-1234-4234-8234-123456789014',
  sharing: '12345678-1234-4234-8234-123456789015',
  outbound: '12345678-1234-4234-8234-123456789016',
  inbound: '12345678-1234-4234-8234-123456789017',
};

export const occurredAt = '2026-11-20T09:00:00.000Z';
export const now = [{ now: '2026-11-22T09:00:00.000Z' }];
export const inboundInput = {
  claimId,
  correlationId: ids.correlation,
  partyKind: 'insurer',
  partyOrganisation: 'Example insurer',
  channel: 'email',
  occurredAt,
  body: 'Repair estimate received',
};
export const outboundInput = {
  ...inboundInput,
  recoveryAuthorityId: ids.recovery,
  representationAuthorityId: ids.representation,
};
export const grantInput = {
  claimId,
  correlationId: ids.correlation,
  kind: 'recovery_agreement',
  evidenceDocumentId: 'document-1',
  version: '2026-1',
  grantedAt: occurredAt,
};
export const followUpInput = {
  claimId,
  correspondenceId: ids.outbound,
  expectedFollowUpAt: null,
  followUpAt: occurredAt,
};
export const caseFieldsInput = {
  claimId,
  otherVehicleCountryCode: 'DE',
  insuranceProofReference: 'proof-01',
  coverageVerificationStatus: 'requested',
  outsideHandlingParty: 'Example bureau',
  caseFollowUpAt: null,
  expected: {
    otherVehicleCountryCode: null,
    insuranceProofReference: null,
    coverageVerificationStatus: 'not_checked',
    outsideHandlingParty: null,
    caseFollowUpAt: null,
  },
};
