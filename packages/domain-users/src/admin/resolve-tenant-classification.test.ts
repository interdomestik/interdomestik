import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryTable = {
  findFirst: ReturnType<typeof vi.fn>;
};

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
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  return {
    db: {
      transaction: vi.fn(),
      query: tables,
    },
    tx: {
      update,
      query: tables,
    },
    update,
    set,
    where,
    tables,
    user: {
      id: 'user.id',
      tenantId: 'user.tenantId',
      tenantClassificationPending: 'user.tenantClassificationPending',
    },
    tenants: {
      id: 'tenants.id',
      isActive: 'tenants.isActive',
    },
    claims: {
      tenantId: 'claims.tenantId',
      userId: 'claims.userId',
    },
    subscriptions: {
      tenantId: 'subscriptions.tenantId',
      userId: 'subscriptions.userId',
    },
    userNotificationPreferences: {
      tenantId: 'userNotificationPreferences.tenantId',
      userId: 'userNotificationPreferences.userId',
    },
    memberNotes: {
      tenantId: 'memberNotes.tenantId',
      memberId: 'memberNotes.memberId',
    },
    notifications: {
      tenantId: 'notifications.tenantId',
      userId: 'notifications.userId',
    },
    pushSubscriptions: {
      tenantId: 'pushSubscriptions.tenantId',
      userId: 'pushSubscriptions.userId',
    },
    userRoles: {
      tenantId: 'userRoles.tenantId',
      userId: 'userRoles.userId',
    },
    agentClients: {
      tenantId: 'agentClients.tenantId',
      memberId: 'agentClients.memberId',
    },
    membershipCards: {
      tenantId: 'membershipCards.tenantId',
      userId: 'membershipCards.userId',
    },
    memberLeads: {
      tenantId: 'memberLeads.tenantId',
      convertedUserId: 'memberLeads.convertedUserId',
    },
    emailCampaignLogs: {
      tenantId: 'emailCampaignLogs.tenantId',
      userId: 'emailCampaignLogs.userId',
    },
    membershipFamilyMembers: {
      tenantId: 'membershipFamilyMembers.tenantId',
      userId: 'membershipFamilyMembers.userId',
    },
    referrals: {
      tenantId: 'referrals.tenantId',
      referrerId: 'referrals.referrerId',
    },
    memberReferralRewards: {
      tenantId: 'memberReferralRewards.tenantId',
      referredMemberId: 'memberReferralRewards.referredMemberId',
    },
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    and: vi.fn((...parts: unknown[]) => ({ op: 'and', parts })),
    withTenant: vi.fn((tenantId: string, tenantColumn: unknown, filter: unknown) => ({
      op: 'withTenant',
      tenantId,
      tenantColumn,
      filter,
    })),
    ensureTenantId: vi.fn((session: { user: { tenantId: string } }) => session.user.tenantId),
  };
});

vi.mock('@interdomestik/database', () => ({
  db: mocks.db,
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

    mocks.where.mockResolvedValue(undefined);
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
    expect(mocks.db.transaction).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith({
      tenantId: 'tenant_ks',
      tenantClassificationPending: false,
    });
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
