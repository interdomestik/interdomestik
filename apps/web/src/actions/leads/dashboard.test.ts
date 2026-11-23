import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mintTenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

import type { HarnessUser } from '@/test/safe-action-harness';

// The real wrapper runs (authentication, scope, refusal record); only its edges are mocked:
// the session source, the audit writer that records refusals, Sentry and the tenant transaction.
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  write: vi.fn(),
  withTenantAuthority: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.withTenantAuthority,
}));
vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (column: unknown) => ({ op: 'desc', column }),
  eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
  ilike: (left: unknown, right: unknown) => ({ op: 'ilike', left, right }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
}));

import { memberLeads } from '@interdomestik/database/schema';

import { listLeadsAction } from './dashboard';

type Condition = { op: string; left?: unknown; right?: unknown; args?: Condition[] };

const TENANT = 'tenant-a';

/** The session and the authority minted from it, as `authorizeSessionTenant` pairs them. */
function signIn(user: Partial<HarnessUser> & { role: string | null }) {
  const { id = 'actor-1', role, branchId = null } = user;
  const session = {
    user: { id, role, tenantId: TENANT, branchId, agentId: null, email: `${id}@x.test`, name: id },
    session: {},
  };
  // The full principal, branch included, exactly as `authorizeSessionTenant` mints it.
  const authority = mintTenantAuthority({
    tenantId: TENANT,
    accessTenantId: TENANT,
    purpose: 'test',
    principal: { userId: id, role, branchId, agentId: null },
  });
  mocks.authorize.mockResolvedValue(Object.freeze({ session, authority }));
}

/** The `eq` conditions of the one lead query, as `column name → value`. */
function queriedEqualities(): Map<string, unknown> {
  expect(mocks.findMany).toHaveBeenCalledTimes(1);
  const where = (mocks.findMany.mock.calls[0][0] as { where: Condition }).where;
  const byColumn = new Map<string, unknown>();
  for (const condition of where.args ?? []) {
    if (condition.op === 'eq')
      byColumn.set((condition.left as { name: string }).name, condition.right);
  }
  return byColumn;
}

function expectRefusalRecorded(code: string) {
  expect(mocks.write).toHaveBeenCalledWith(
    expect.objectContaining({
      entityId: 'legacy',
      metadata: expect.objectContaining({ code, basis: 'legacy' }),
    })
  );
}

describe('listLeadsAction role gate (deny by default)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.write.mockResolvedValue({ ok: true });
    mocks.findMany.mockResolvedValue([{ id: 'lead-1' }]);
    mocks.withTenantAuthority.mockImplementation(
      (_authority: unknown, callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback({ query: { memberLeads: { findMany: mocks.findMany } } }))
    );
  });

  it.each(['member', 'user', 'staff', 'promoter', 'auditor', 'global_support', 'unknown_role'])(
    'refuses role %s with a recorded FORBIDDEN before any read',
    async role => {
      signIn({ role });

      await expect(listLeadsAction({})).resolves.toEqual({
        success: false,
        code: 'FORBIDDEN',
        error: 'Forbidden',
      });
      expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
      expectRefusalRecorded('FORBIDDEN');
    }
  );

  it('refuses a session without a role before any read', async () => {
    signIn({ role: null });

    await expect(listLeadsAction({})).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
  });

  it('refuses a disallowed role even when the input is invalid (the gate runs first)', async () => {
    signIn({ role: 'member' });

    await expect(listLeadsAction({ status: 'not-a-status' })).resolves.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('shows an agent only its own leads, whatever branch the input names', async () => {
    signIn({ id: 'agent-1', role: 'agent', branchId: 'branch-1' });

    const result = await listLeadsAction({ branchId: 'branch-other' });

    expect(result).toEqual({ success: true, data: [{ id: 'lead-1' }] });
    const where = queriedEqualities();
    expect(where.get(memberLeads.tenantId.name)).toBe(TENANT);
    expect(where.get(memberLeads.agentId.name)).toBe('agent-1');
    expect(where.has(memberLeads.branchId.name)).toBe(false);
  });

  it("limits a branch manager to the session's branch, ignoring a branch named in the input", async () => {
    signIn({ id: 'manager-1', role: 'branch_manager', branchId: 'branch-1' });

    await expect(listLeadsAction({ branchId: 'branch-other' })).resolves.toMatchObject({
      success: true,
    });
    const where = queriedEqualities();
    expect(where.get(memberLeads.tenantId.name)).toBe(TENANT);
    expect(where.get(memberLeads.branchId.name)).toBe('branch-1');
    expect(where.has(memberLeads.agentId.name)).toBe(false);
  });

  it('refuses a branch manager without a branch before any read', async () => {
    signIn({ id: 'manager-1', role: 'branch_manager', branchId: null });

    await expect(listLeadsAction({})).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN_NO_BRANCH',
    });
    expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
    expectRefusalRecorded('FORBIDDEN_NO_BRANCH');
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'lets %s read the tenant, with the optional branch filter',
    async role => {
      signIn({ role });

      await expect(listLeadsAction({ branchId: 'branch-2' })).resolves.toMatchObject({
        success: true,
      });
      const where = queriedEqualities();
      expect(where.get(memberLeads.tenantId.name)).toBe(TENANT);
      expect(where.get(memberLeads.branchId.name)).toBe('branch-2');
      expect(where.has(memberLeads.agentId.name)).toBe(false);
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );

  it.each([{ tenantId: 'tenant-b' }, { agentId: 'agent-2' }, { userId: 'someone' }])(
    'refuses an input that names identity or tenant (%j) with VALIDATION_ERROR, reading nothing',
    async injected => {
      signIn({ id: 'agent-1', role: 'agent' });

      await expect(listLeadsAction({ search: 'a', ...injected })).resolves.toMatchObject({
        success: false,
        code: 'VALIDATION_ERROR',
      });
      expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['another agent', { userId: 'agent-2', role: 'agent', branchId: null }],
    ['another role', { userId: 'agent-1', role: 'admin', branchId: null }],
    ['another branch', { userId: 'agent-1', role: 'agent', branchId: 'branch-9' }],
  ])(
    'refuses an authority minted for %s than the session, before any read',
    async (_label, principal) => {
      signIn({ id: 'agent-1', role: 'agent' });
      const { session } = await mocks.authorize();
      mocks.authorize.mockResolvedValue({
        session,
        authority: mintTenantAuthority({
          tenantId: TENANT,
          accessTenantId: TENANT,
          purpose: 'test',
          principal: { ...principal, agentId: null },
        }),
      });

      await expect(listLeadsAction({})).resolves.toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      });
      expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
      expectRefusalRecorded('FORBIDDEN');
    }
  );

  it.each(['', '   '])(
    'lets an agent whose session holds a blank branch (%j) list its own leads',
    async branchId => {
      // The authority stores a blank branch as none; the binding treats it the same way.
      signIn({ id: 'agent-1', role: 'agent', branchId });

      await expect(listLeadsAction({})).resolves.toMatchObject({ success: true });
      expect(queriedEqualities().get(memberLeads.agentId.name)).toBe('agent-1');
    }
  );

  it.each(['branch-1 ', ' branch-1'])(
    'refuses a branch manager whose session branch (%j) only matches after trimming',
    async branchId => {
      // Base filtered on the session branch as stored, which matched no lead of branch-1.
      signIn({ id: 'manager-1', role: 'branch_manager', branchId });

      await expect(listLeadsAction({})).resolves.toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      });
      expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
    }
  );

  it.each(['tenant_admin ', ' agent'])(
    'refuses a padded session role (%j), although the authority stores it trimmed',
    async role => {
      signIn({ id: 'actor-1', role });

      await expect(listLeadsAction({})).resolves.toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      });
      expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
    }
  );

  it('refuses an authority without a principal, before any read', async () => {
    signIn({ id: 'agent-1', role: 'agent' });
    const { session } = await mocks.authorize();
    mocks.authorize.mockResolvedValue({ session, authority: mintTestTenantAuthority(TENANT) });

    await expect(listLeadsAction({})).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
  });

  it('treats an empty branch filter as no filter, as before', async () => {
    signIn({ role: 'tenant_admin' });

    await expect(listLeadsAction({ branchId: '' })).resolves.toMatchObject({ success: true });
    expect(queriedEqualities().has(memberLeads.branchId.name)).toBe(false);
  });
});
