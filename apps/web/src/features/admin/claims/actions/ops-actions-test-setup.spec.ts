import { beforeEach, expect, vi } from 'vitest';

// Exercises the real ops action guards (action-helpers + ops-action-outcome) with only the
// session/headers/cache boundary, the tenant transaction factory and the canonical transition
// command replaced. This is source-level evidence, not restricted-role/RLS/rollback proof.
const mocks = vi.hoisted(() => ({
  directDb: vi.fn(),
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
  transitionInTx: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@interdomestik/database', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database')>();
  const forbidden = (path: string) => () => {
    mocks.directDb(path);
    throw new Error(`ambient db.${path} must not be used`);
  };
  return {
    ...actual,
    // Ambient pooled access outside the tenant transaction is never acceptable here.
    db: {
      insert: forbidden('insert'),
      query: {
        auditLog: { findFirst: forbidden('query.auditLog') },
        claims: { findFirst: forbidden('query.claims') },
      },
      select: forbidden('select'),
      transaction: forbidden('transaction'),
      update: forbidden('update'),
    },
    withTenantContext: mocks.withTenantContext,
  };
});
vi.mock('@interdomestik/domain-claims/admin-claims/status-transition', () => ({
  transitionAdminClaimStatus: vi.fn(),
  transitionAdminClaimStatusInTransaction: mocks.transitionInTx,
}));
vi.mock('./ops-assignment', () => ({
  ASSIGNMENT_TARGET_DENIED_ERROR: 'Assignment target denied',
  assignClaimOwnerInTransaction: vi.fn(),
}));

import { markSlaAcknowledged, sendMemberReminder, updateStatus } from './ops-actions';

type Effect = Readonly<{ kind: string; table?: unknown; values?: Record<string, unknown> }>;
type TxOptions = Readonly<{
  claim?: Record<string, unknown> | null;
  failInsertInto?: unknown;
  lastReminderAt?: Date;
  lockedRows?: number;
}>;

const ACTIVE_CLAIM = {
  caseLifecycleState: 'evaluation',
  claimNumber: 'SYN-0001',
  id: 'claim-1',
  lifecycleVersion: 3,
  recoveryLifecycleState: 'not_started',
  staffId: 'staff-9',
  status: 'evaluation',
  tenantId: 'tenant-mk',
};
export const TERMINAL_CLAIM = {
  ...ACTIVE_CLAIM,
  caseLifecycleState: 'resolved',
  recoveryLifecycleState: 'resolved',
  status: 'resolved',
};
const SQL_WITH_PII = 'insert into "claim_messages" ($1) params: jane.member@example.test';
export const SAFE_FAILURE = { success: false, error: 'Action failed. Please try again.' };

function makeTenantTx(options: TxOptions = {}) {
  const effects: Effect[] = [];
  const claim = options.claim === undefined ? ACTIVE_CLAIM : options.claim;
  const lockChain = {
    for: async (strength: string) => {
      effects.push({ kind: `lock:${strength}` });
      return Array.from({ length: options.lockedRows ?? 1 }, () => ({ id: 'claim-1' }));
    },
    from: () => lockChain,
    limit: () => lockChain,
    where: () => lockChain,
  };
  const tx = {
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === options.failInsertInto) throw new Error(SQL_WITH_PII);
        effects.push({ kind: 'insert', table, values });
      },
    }),
    query: {
      auditLog: {
        findFirst: async () => {
          effects.push({ kind: 'read:lastReminder' });
          return options.lastReminderAt ? { createdAt: options.lastReminderAt } : undefined;
        },
      },
      claims: {
        findFirst: async () => {
          effects.push({ kind: 'read:claim' });
          return claim ?? undefined;
        },
      },
    },
    select: () => lockChain,
  };
  return { effects, tx };
}

export let tenant = makeTenantTx();

export function useTenantTx(options: TxOptions) {
  tenant = makeTenantTx(options);
}

export function signIn(user: Record<string, unknown>) {
  mocks.getSession.mockResolvedValue({ user: { id: 'actor-1', tenantId: 'tenant-mk', ...user } });
}

export function insertedInto(table: unknown): Effect[] {
  return tenant.effects.filter(effect => effect.kind === 'insert' && effect.table === table);
}

export function expectNoResourceAccess() {
  expect(mocks.withTenantContext).not.toHaveBeenCalled();
  expect(mocks.transitionInTx).not.toHaveBeenCalled();
  expect(mocks.directDb).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
  expect(tenant.effects).toEqual([]);
}

export const ENTRYPOINTS = [
  ['updateStatus', () => updateStatus('claim-1', 'verification', 'en')],
  ['markSlaAcknowledged', () => markSlaAcknowledged('claim-1', 'en')],
  ['sendMemberReminder', () => sendMemberReminder('claim-1', 'email', 'en')],
] as const;

export const FORBIDDEN_USERS: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['member', { role: 'member' }],
  ['user', { role: 'user' }],
  ['agent', { role: 'agent' }],
  ['branch_manager on own branch', { role: 'branch_manager', branchId: 'branch-a' }],
  ['branch_manager on other branch', { role: 'branch_manager', branchId: 'branch-b' }],
  ['branch_manager without branch', { role: 'branch_manager', branchId: null }],
  ['assigned staff', { id: 'staff-9', role: 'staff' }],
  ['global_support', { role: 'global_support' }],
  ['support', { role: 'support' }],
  ['auditor', { role: 'auditor' }],
  ['promoter', { role: 'promoter' }],
  ['null role', { role: null }],
  ['unknown role', { role: 'owner' }],
  ['case-variant admin', { role: 'ADMIN' }],
  ['staff holding persisted admin grants', { role: 'staff', roles: ['admin', 'tenant_admin'] }],
];

export const ADMIN_ROLES = ['admin', 'tenant_admin', 'super_admin'] as const;

beforeEach(() => {
  vi.clearAllMocks();
  tenant = makeTenantTx();
  mocks.revalidatePath.mockImplementation(() => undefined);
  mocks.withTenantContext.mockImplementation(
    async (_context: unknown, action: (tx: unknown) => Promise<unknown>) => action(tenant.tx)
  );
  mocks.transitionInTx.mockResolvedValue({
    success: true,
    fromStatus: 'evaluation',
    lifecycleVersion: 4,
    status: 'verification',
  });
});

export { mocks };
