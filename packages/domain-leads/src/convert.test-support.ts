import { vi } from 'vitest';

const tableRefs = vi.hoisted(() => ({
  memberLeads: { table: 'memberLeads', id: 'memberLeads.id', tenantId: 'memberLeads.tenantId' },
  membershipCards: { table: 'membershipCards' },
  subscriptions: { table: 'subscriptions' },
  user: { table: 'user' },
  agentClients: { table: 'agentClients' },
}));

const mocks = vi.hoisted(() => ({
  eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
  and: vi.fn((...clauses) => ({ clauses, op: 'and' })),
  asc: vi.fn(value => ({ op: 'asc', value })),
  selectResults: [] as unknown[][],
  // The lead as the conversion transaction re-reads it under lock.
  lockedLead: [{ status: 'new', convertedUserId: null }] as unknown[],
  db: {
    query: {
      memberLeads: {
        findFirst: vi.fn(),
      },
      membershipPlans: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(),
  },
  withTenantContext: vi.fn(),
  membershipPlans: {
    id: 'membership_plans.id',
    tenantId: 'membership_plans.tenant_id',
    tier: 'membership_plans.tier',
    paddlePriceId: 'membership_plans.paddle_price_id',
    interval: 'membership_plans.interval',
    isActive: 'membership_plans.is_active',
  },
  issueTenantMemberNumber: vi.fn(),
  nanoid: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  agentClients: tableRefs.agentClients,
  and: mocks.and,
  asc: mocks.asc,
  db: mocks.db,
  eq: mocks.eq,
  issueTenantMemberNumber: mocks.issueTenantMemberNumber,
  membershipPlans: mocks.membershipPlans,
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/schema', () => tableRefs);

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
  customAlphabet: vi.fn(() => () => 'REFCODE01'),
}));

export type InsertRecord = {
  table: unknown;
  values: Record<string, unknown>;
};
export type ConflictRecord = {
  payload: Record<string, unknown>;
  table: unknown;
  values: Record<string, unknown>;
};

export function createTransactionHarness() {
  const insertRecords: InsertRecord[] = [];
  const conflictRecords: ConflictRecord[] = [];
  const updateCalls: Array<{ table: unknown; values?: Record<string, unknown>; where?: unknown }> =
    [];

  const tx = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: Record<string, unknown>) => {
        insertRecords.push({ table, values });
        return {
          onConflictDoUpdate: vi.fn((payload: Record<string, unknown>) => {
            conflictRecords.push({ table, values, payload });
            return Promise.resolve();
          }),
        };
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updateCalls.push({ table, values });
        return {
          where: vi.fn((where: unknown) => {
            const lastCall = updateCalls.at(-1);
            if (lastCall) {
              lastCall.where = where;
            }
            return Promise.resolve();
          }),
        };
      }),
    })),
  };

  return { conflictRecords, insertRecords, tx, updateCalls };
}

export { tableRefs, mocks };
