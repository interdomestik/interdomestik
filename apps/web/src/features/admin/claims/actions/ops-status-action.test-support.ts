import {
  claimEscalationAgreements,
  claims,
  pushSubscriptions,
  user,
  userNotificationPreferences,
} from '@interdomestik/database';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  transaction: vi.fn(),
  refusal: vi.fn(),
  rateLimit: vi.fn(),
  refresh: vi.fn(),
  projection: vi.fn(),
  kick: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: mocks.authorizeSessionTenant,
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.refusal }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimitForAction: mocks.rateLimit }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock('@interdomestik/domain-claims/claims/notification-delivery-runner', () => ({
  dispatchNotificationDeliveries: mocks.kick,
}));
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: mocks.transaction,
  relayClaimStatusAuditProjectionEvents: mocks.projection,
}));

const tenantId = 'tenant-claim-test';
const claimId = 'claim-1';

function signIn(role: string, options: { principal?: boolean; tenant?: string } = {}) {
  const authority = mintTestTenantAuthority(
    options.tenant ?? tenantId,
    options.principal === false ? {} : { userId: 'actor', role }
  );
  mocks.authorizeSessionTenant.mockResolvedValue({
    session: { user: { id: 'actor', role, branchId: 'branch-1' } },
    authority,
  });
  return authority;
}

type Row = Record<string, unknown>;
type Effect = { table: unknown; row: Row };
type FakeTransactionOptions = {
  current?: 'draft' | 'submitted' | 'verification' | 'rejected';
  inScope?: boolean;
  conflict?: boolean;
};

function configureTransaction(options: FakeTransactionOptions = {}) {
  const fromStatus = options.current ?? 'submitted';
  const lockedClaim = {
    id: claimId,
    ...claimLifecycleFieldsForStatus(fromStatus),
    category: 'consumer',
    lifecycleVersion: 4,
    staffId: 'actor',
    title: 'Test claim',
    userId: 'owner',
  };
  const rows = (table: unknown): Row[] => {
    if (table === claims) return options.inScope === false ? [] : [lockedClaim];
    if (table === user) return [{ id: 'owner', role: 'agent', emailVerified: true }];
    if (table === pushSubscriptions) return [{ id: 'push-1' }];
    if (table === userNotificationPreferences || table === claimEscalationAgreements) return [];
    throw new Error('Unexpected table read in claim status test');
  };
  const firstLock = vi.fn();
  const writes: Effect[] = [];
  const inserts: Effect[] = [];
  let committed = false;
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const chain = {
            for: (strength: string) => {
              firstLock(table, strength);
              return Promise.resolve(rows(table));
            },
          };
          return Object.assign(Promise.resolve(rows(table)), chain, {
            limit: () => Object.assign(Promise.resolve(rows(table)), chain),
          });
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (row: Row) => ({
        where: () => {
          writes.push({ table, row });
          return {
            returning: () =>
              Promise.resolve(
                options.conflict
                  ? []
                  : [
                      {
                        id: claimId,
                        lifecycleVersion: 'lifecycleVersion' in row ? 5 : 4,
                      },
                    ]
              ),
          };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: Row) => {
        inserts.push({ table, row });
        return {
          returning: () => Promise.resolve([{ id: row.id }]),
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve([{ id: row.id }]),
          }),
        };
      },
    }),
  };
  mocks.transaction.mockImplementationOnce(async (_authority, run) => {
    const result = await run(tx);
    committed = true;
    return result;
  });
  return { inserts, writes, firstLock, committed: () => committed };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rateLimit.mockResolvedValue({ limited: false });
  mocks.refusal.mockResolvedValue({ success: true });
  mocks.transaction.mockImplementation((_authority, run) => run({ projection: true }));
});

export { claimId, configureTransaction, mocks, signIn };
