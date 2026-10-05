import { vi } from 'vitest';

import type { runCommercialActionWithIdempotency } from './commercial-action-idempotency';

export type CommercialActionParams = Parameters<typeof runCommercialActionWithIdempotency>[0];

// Shared statement builders so behaviour assertions stay client-agnostic.
export const insertValues = vi.fn();
export const onConflictDoNothing = vi.fn();
export const returning = vi.fn();
export const selectFrom = vi.fn();
export const selectWhere = vi.fn();
export const selectLimit = vi.fn();
export const updateSet = vi.fn();
export const updateWhere = vi.fn();
export const deleteWhere = vi.fn();

// Unscoped client entry points: legitimate only for the allowlisted public path.
export const dbEntry = {
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

export const txEntry = {
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

export const tenantContexts: unknown[] = [];
let openContexts = 0;

export const withTenantContextMock = vi.fn(
  async (context: unknown, action: (tx: typeof txEntry) => Promise<unknown>) => {
    if (openContexts > 0) {
      throw new Error('nested tenant context transaction is forbidden');
    }
    openContexts += 1;
    tenantContexts.push(context);
    try {
      return await action(txEntry);
    } finally {
      openContexts -= 1;
    }
  }
);

export const databaseModuleMock = () => ({
  db: dbEntry,
  withTenantContext: withTenantContextMock,
  commercialActionIdempotency: {
    id: 'id_col',
    action: 'action_col',
    idempotencyKey: 'idempotency_key_col',
    requestFingerprintHash: 'request_fingerprint_hash_col',
    status: 'status_col',
    responsePayload: 'response_payload_col',
    tenantId: 'tenant_id_col',
    actorUserId: 'actor_user_id_col',
  },
  and: vi.fn((...args: unknown[]) => ['and', ...args]),
  eq: vi.fn((...args: unknown[]) => ['eq', ...args]),
  isNull: vi.fn((...args: unknown[]) => ['isNull', ...args]),
});

export function resetCommercialActionMocks(): void {
  vi.clearAllMocks();
  openContexts = 0;
  tenantContexts.length = 0;

  returning.mockResolvedValue([{ id: 'idem_1' }]);
  onConflictDoNothing.mockReturnValue({ returning });
  insertValues.mockReturnValue({ onConflictDoNothing });
  dbEntry.insert.mockReturnValue({ values: insertValues });
  txEntry.insert.mockReturnValue({ values: insertValues });

  selectLimit.mockResolvedValue([]);
  selectWhere.mockReturnValue({ limit: selectLimit });
  selectFrom.mockReturnValue({ where: selectWhere });
  dbEntry.select.mockReturnValue({ from: selectFrom });
  txEntry.select.mockReturnValue({ from: selectFrom });

  updateWhere.mockResolvedValue(undefined);
  updateSet.mockReturnValue({ where: updateWhere });
  dbEntry.update.mockReturnValue({ set: updateSet });
  txEntry.update.mockReturnValue({ set: updateSet });

  deleteWhere.mockResolvedValue(undefined);
  dbEntry.delete.mockReturnValue({ where: deleteWhere });
  txEntry.delete.mockReturnValue({ where: deleteWhere });
}

export function tenantScope(actorUserId = 'user-1', tenantId = 'tenant-1') {
  return { kind: 'tenant' as const, actorUserId, tenantId };
}

export function publicFreeStartScope() {
  return {
    kind: 'public' as const,
    reason: 'public-free-start-intake-no-tenant-mutation' as const,
  };
}

export function claimParams(
  overrides: Partial<CommercialActionParams> = {}
): CommercialActionParams {
  return {
    action: 'claims.submit',
    scope: tenantScope(),
    idempotencyKey: 'claim-submit-1',
    requestFingerprint: { category: 'vehicle', title: 'Damaged bumper' },
    execute: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

export function freeStartParams(
  overrides: Partial<CommercialActionParams> = {}
): CommercialActionParams {
  return {
    action: 'free-start.submit',
    scope: publicFreeStartScope(),
    idempotencyKey: 'free-start-1',
    requestFingerprint: { category: 'property' },
    execute: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}
