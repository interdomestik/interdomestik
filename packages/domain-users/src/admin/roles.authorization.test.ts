import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  lock: vi.fn(),
  where: vi.fn(),
  readRoles: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  insert: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: mocks.context,
  user: { id: 'user.id', tenantId: 'user.tenantId', role: 'user.role' },
  userRoles: {
    id: 'roles.id',
    tenantId: 'roles.tenantId',
    userId: 'roles.userId',
    role: 'roles.role',
    branchId: 'roles.branchId',
  },
  branches: {},
  eq: (left: unknown, right: unknown) => ({ left, right }),
  and: (...parts: unknown[]) => parts,
}));
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: (tenantId: string, column: unknown, condition: unknown) => ({
    tenantId,
    column,
    condition,
  }),
}));
vi.mock('drizzle-orm', () => ({ isNull: (column: unknown) => ({ column, isNull: true }) }));

// Deliberately use the real shared-auth permission matrix and tenant resolver.
import { grantUserRoleCore, revokeUserRoleCore } from './roles';

const session = (role: string, id = 'admin-1') => ({ user: { id, role, tenantId: 'tenant_ks' } });
const params = (actor: string, role: string, userId = 'user-1') => ({
  session: session(actor),
  tenantId: 'tenant_ks',
  userId,
  role,
});
const platformRoles = ['super_admin', 'global_support', 'auditor'];
const tenantActors = ['admin', 'tenant_admin'];

function transaction() {
  return {
    select: () => ({ from: () => ({ where: mocks.where }) }),
    query: { userRoles: { findMany: mocks.readRoles } },
    update: () => ({ set: mocks.update }),
    delete: () => ({ where: mocks.remove }),
    insert: () => ({ values: mocks.insert }),
  };
}
function expectNoMutation() {
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
}

describe('role mutation authorization boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.lock.mockResolvedValue([{ role: 'member' }]);
    mocks.where.mockReturnValue({ for: mocks.lock });
    mocks.readRoles.mockResolvedValue([]);
    mocks.update.mockReturnValue({ where: () => ({ returning: async () => [{ id: 'user-1' }] }) });
    mocks.remove.mockReturnValue({ returning: async () => [{ id: 'assignment-1' }] });
    mocks.insert.mockReturnValue({ returning: async () => [{ id: 'assignment-1' }] });
    mocks.context.mockImplementation(async (_scope, run) => run(transaction()));
  });

  for (const actor of tenantActors) {
    for (const targetId of ['admin-1', 'user-1']) {
      it.each(platformRoles)(`${actor} cannot grant or revoke %s for ${targetId}`, async role => {
        expect(
          await grantUserRoleCore(params(actor, role, targetId), { logAuditEvent: mocks.audit })
        ).toEqual({ error: 'Role cannot be granted' });
        expect(
          await revokeUserRoleCore(params(actor, role, targetId), { logAuditEvent: mocks.audit })
        ).toEqual({ error: 'Role cannot be revoked' });
        expect(mocks.context).not.toHaveBeenCalled();
        expectNoMutation();
      });
    }
    for (const primary of [true, false]) {
      it.each(platformRoles)(
        `${actor} cannot mutate a protected target (%s, primary=${primary})`,
        async role => {
          mocks.lock.mockResolvedValue([{ role: primary ? role : 'member' }]);
          mocks.readRoles.mockResolvedValue(primary ? [] : [{ role }]);
          expect(await grantUserRoleCore(params(actor, 'member'))).toEqual({
            error: 'Role cannot be granted',
          });
          expect(await revokeUserRoleCore(params(actor, 'member'))).toEqual({
            error: 'Role cannot be revoked',
          });
          expect(mocks.lock).toHaveBeenCalledWith('update');
          expectNoMutation();
        }
      );
    }
    it.each(['admin', 'tenant_admin', 'staff', 'member', 'promoter'])(
      `${actor} retains allowed %s grants`,
      async role => {
        expect(await grantUserRoleCore(params(actor, role))).toEqual({ success: true });
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ role }));
        expect(mocks.where).toHaveBeenCalledWith({
          tenantId: 'tenant_ks',
          column: 'user.tenantId',
          condition: { left: 'user.id', right: 'user-1' },
        });
        expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
          mocks.readRoles.mock.invocationCallOrder[0]
        );
        expect(mocks.readRoles.mock.invocationCallOrder[0]).toBeLessThan(
          mocks.update.mock.invocationCallOrder[0]
        );
      }
    );
  }

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    '%s cannot grant or revoke unknown roles',
    async actor => {
      for (const role of ['custom_platform', 'SUPER_ADMIN', 'staff,super_admin']) {
        expect(await grantUserRoleCore(params(actor, role))).toEqual({
          error: 'Role cannot be granted',
        });
        expect(await revokeUserRoleCore(params(actor, role))).toEqual({
          error: 'Role cannot be revoked',
        });
      }
      expectNoMutation();
    }
  );

  it.each(platformRoles)('super_admin can still administer %s', async role => {
    mocks.lock.mockResolvedValue([{ role }]);
    expect(await grantUserRoleCore(params('super_admin', role))).toEqual({ success: true });
    expect(await revokeUserRoleCore(params('super_admin', role))).toEqual({ success: true });
    expect(mocks.lock).toHaveBeenCalledWith('update');
  });

  it.each(['member', 'staff', 'agent', 'branch_manager', 'global_support', 'auditor', 'unknown'])(
    'rejects unauthorized actor %s using real permissions',
    async actor => {
      await expect(grantUserRoleCore(params(actor, 'staff'))).rejects.toThrow('Permission denied');
      await expect(revokeUserRoleCore(params(actor, 'staff'))).rejects.toThrow('Permission denied');
      expectNoMutation();
    }
  );

  it('preserves foreign-tenant denial before touching the target', async () => {
    const foreign = { ...params('tenant_admin', 'staff'), tenantId: 'tenant_mk' };
    await expect(grantUserRoleCore(foreign)).rejects.toThrow('Unauthorized');
    await expect(revokeUserRoleCore(foreign)).rejects.toThrow('Unauthorized');
    expect(mocks.context).not.toHaveBeenCalled();
  });

  it('denies a missing target without mutation', async () => {
    mocks.lock.mockResolvedValue([]);
    expect(await grantUserRoleCore(params('tenant_admin', 'staff'))).toEqual({
      error: 'Role cannot be granted',
    });
    expect(await revokeUserRoleCore(params('tenant_admin', 'staff'))).toEqual({
      error: 'Role cannot be revoked',
    });
    expectNoMutation();
  });

  it('waits for the target lock and observes a concurrent platform promotion before mutation', async () => {
    let release!: (value: { role: string }[]) => void;
    const acquired = new Promise<{ role: string }[]>(resolve => {
      release = resolve;
    });
    mocks.lock.mockReturnValue(acquired);
    const granting = grantUserRoleCore(params('tenant_admin', 'staff'));
    await vi.waitFor(() => expect(mocks.lock).toHaveBeenCalled());
    expect(mocks.readRoles).not.toHaveBeenCalled();
    expectNoMutation();
    release([{ role: 'super_admin' }]);
    expect(await granting).toEqual({ error: 'Role cannot be granted' });
    expectNoMutation();
  });

  it('throws inside the transaction instead of committing an unknown fallback role', async () => {
    mocks.lock.mockResolvedValue([{ role: 'member' }]);
    mocks.readRoles.mockResolvedValue([{ role: 'custom_old_role', branchId: null }]);
    let committed = false;
    mocks.context.mockImplementation(async (_scope, run) => {
      const result = await run(transaction());
      committed = true;
      return result;
    });
    await expect(revokeUserRoleCore(params('tenant_admin', 'member'))).rejects.toThrow(
      'Role cannot be revoked'
    );
    expect(committed).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
