import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryTable = { findFirst: ReturnType<typeof vi.fn> };
type MockTenantSession = { user: { accessTenantId?: string | null; tenantId?: string | null } };
const schema = await vi.hoisted(
  async () => (await import('./resolve-tenant-classification.test-fixtures')).classificationSchema
);
const mocks = vi.hoisted(() => {
  const makeQueryTable = (): QueryTable => ({
    findFirst: vi.fn(),
  });

  const tables = {
    claims: makeQueryTable(),
    subscriptions: makeQueryTable(),
    userNotificationPreferences: makeQueryTable(),
    memberNotes: makeQueryTable(),
    agentClients: makeQueryTable(),
    pushSubscriptions: makeQueryTable(),
    membershipCards: makeQueryTable(),
    userRoles: makeQueryTable(),
    memberLeads: makeQueryTable(),
    emailCampaignLogs: makeQueryTable(),
    membershipFamilyMembers: makeQueryTable(),
    notifications: makeQueryTable(),
    referrals: makeQueryTable(),
    memberReferralRewards: makeQueryTable(),
    tenants: makeQueryTable(),
    user: makeQueryTable(),
  };
  const where = vi.fn();
  const returning = vi.fn();
  const lock = vi.fn();
  const selectWhere = vi.fn(() => ({ for: lock }));
  const from = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from }));
  const withTenantContext = vi.fn();
  const resolveTenantId = ({ user }: MockTenantSession) =>
    user.accessTenantId?.trim() || user.tenantId?.trim();
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return {
    db: {
      transaction: vi.fn(),
      query: tables,
    },
    tx: {
      select,
      update,
      query: tables,
    },
    withTenantContext,
    returning,
    lock,
    selectWhere,
    select,
    update,
    set,
    where,
    tables,
    ...schema,
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    and: vi.fn((...parts: unknown[]) => ({ op: 'and', parts })),
    withTenant: vi.fn((tenantId: string, tenantColumn: unknown, filter: unknown) => ({
      op: 'withTenant',
      tenantId,
      tenantColumn,
      filter,
    })),
    ensureAccessTenantId: vi.fn(resolveTenantId),
    ensureTenantId: vi.fn(resolveTenantId),
  };
});

vi.mock('@interdomestik/database', () => ({
  db: mocks.db,
  withTenantContext: mocks.withTenantContext,
  user: mocks.user,
  tenants: mocks.tenants,
  claims: mocks.claims,
  subscriptions: mocks.subscriptions,
  userNotificationPreferences: mocks.userNotificationPreferences,
  memberNotes: mocks.memberNotes,
  notifications: mocks.notifications,
  pushSubscriptions: mocks.pushSubscriptions,
  userRoles: mocks.userRoles,
  agentClients: mocks.agentClients,
  membershipCards: mocks.membershipCards,
  memberLeads: mocks.memberLeads,
  emailCampaignLogs: mocks.emailCampaignLogs,
  membershipFamilyMembers: mocks.membershipFamilyMembers,
  referrals: mocks.referrals,
  memberReferralRewards: mocks.memberReferralRewards,
  eq: mocks.eq,
  and: mocks.and,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureAccessTenantId: mocks.ensureAccessTenantId,
  ensureTenantId: mocks.ensureTenantId,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('./access', () => ({
  requireTenantAdminSession: vi.fn(async (session: unknown) => session),
}));

import { resolveTenantClassificationCore } from './resolve-tenant-classification';

const adminSession = {
  user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' },
} as never;

const superAdminSession = {
  user: { id: 'super-1', role: 'super_admin', tenantId: 'tenant_ks' },
} as never;

describe('resolveTenantClassificationCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.where.mockReturnValue({ returning: mocks.returning });
    mocks.returning.mockResolvedValue([{ id: 'member-1' }]);
    mocks.lock.mockResolvedValue([{ tenantClassificationPending: true }]);
    mocks.withTenantContext.mockImplementation(async (_context, callback) => callback(mocks.tx));
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.db.transaction.mockImplementation(async callback => callback(mocks.tx as never));

    for (const table of Object.values(mocks.tables)) {
      table.findFirst.mockResolvedValue(undefined);
    }

    mocks.tables.user.findFirst.mockResolvedValue({
      id: 'member-1',
      tenantId: 'tenant_ks',
      tenantClassificationPending: true,
    });
  });

  it('confirms the current tenant and clears pending', async () => {
    const result = await resolveTenantClassificationCore({
      session: adminSession,
      userId: 'member-1',
      currentTenantId: 'tenant_ks',
    });

    expect(result).toEqual({
      success: true,
      data: {
        previousTenantId: 'tenant_ks',
        tenantId: 'tenant_ks',
        previousPending: true,
        tenantClassificationPending: false,
        resolutionMode: 'confirm_current',
      },
    });
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_ks' },
      expect.any(Function)
    );
    expect(mocks.lock).toHaveBeenCalledWith('update');
    expect(mocks.returning).toHaveBeenCalledWith({ id: mocks.user.id });
    expect(mocks.tables.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.set).toHaveBeenCalledWith({
      tenantClassificationPending: false,
    });
  });

  it('preserves the locked previous pending value on repeated confirmation', async () => {
    mocks.lock.mockResolvedValueOnce([{ tenantClassificationPending: false }]);
    const result = await resolveTenantClassificationCore({
      session: adminSession,
      userId: 'member-1',
      currentTenantId: 'tenant_ks',
    });
    expect(result).toMatchObject({ success: true, data: { previousPending: false } });
  });

  it('refuses an invisible user before updating', async () => {
    mocks.lock.mockResolvedValueOnce([]);
    const result = await resolveTenantClassificationCore({
      session: adminSession,
      userId: 'foreign-member',
      currentTenantId: 'tenant_ks',
    });
    expect(result).toEqual({ error: 'User not found' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not report success when the update returns no row', async () => {
    mocks.returning.mockResolvedValueOnce([]);
    const result = await resolveTenantClassificationCore({
      session: adminSession,
      userId: 'member-1',
      currentTenantId: 'tenant_ks',
    });
    expect(result).toHaveProperty('error');
    expect(result).not.toHaveProperty('success');
  });

  it('allows super admins to reassign eligible members', async () => {
    mocks.tables.tenants.findFirst.mockResolvedValueOnce({ id: 'tenant_mk' });

    const result = await resolveTenantClassificationCore({
      session: superAdminSession,
      userId: 'member-1',
      currentTenantId: 'tenant_ks',
      targetTenantId: 'tenant_mk',
    });

    expect(result).toEqual({
      success: true,
      data: {
        previousTenantId: 'tenant_ks',
        tenantId: 'tenant_mk',
        previousPending: true,
        tenantClassificationPending: false,
        resolutionMode: 'reassign',
      },
    });
    expect(mocks.set).toHaveBeenCalledWith({
      tenantId: 'tenant_mk',
      tenantClassificationPending: false,
    });
  });

  it('rejects cross-tenant operations for non-super-admin sessions', async () => {
    const result = await resolveTenantClassificationCore({
      session: adminSession,
      userId: 'member-1',
      currentTenantId: 'tenant_mk',
    });

    expect(result).toEqual({ error: 'Unauthorized' });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it('blocks reassignment when tenant-bound records exist', async () => {
    mocks.tables.tenants.findFirst.mockResolvedValueOnce({ id: 'tenant_mk' });
    mocks.tables.claims.findFirst.mockResolvedValueOnce({ id: 'claim-1' });

    const result = await resolveTenantClassificationCore({
      session: superAdminSession,
      userId: 'member-1',
      currentTenantId: 'tenant_ks',
      targetTenantId: 'tenant_mk',
    });

    expect(result).toEqual({
      error: 'Cannot reassign tenant classification while tenant-bound records exist',
    });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });
});
