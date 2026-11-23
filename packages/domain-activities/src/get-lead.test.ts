import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { equalities, type FakeRows, useFakeTx, withTenantAuthority } from './test/activity-tx';

vi.mock('@interdomestik/database', async () => (await import('./test/activity-tx')).databaseMock);
vi.mock('drizzle-orm', async () => (await import('./test/activity-tx')).drizzleMock);
vi.mock(
  '@interdomestik/database/tenant-authority-context',
  async () => (await import('./test/activity-tx')).tenantContextMock
);

import { getLeadActivitiesCore } from './get-lead';

const activityRow = { id: 'act-1', leadId: 'lead-1', summary: 'Called', createdAt: new Date(0) };

/** A session and the authority minted for the same principal, as the web layer pairs them. */
function actorAs(role: string, id = 'actor-1') {
  return {
    session: { user: { id, role, tenantId: 'tenant-1' } },
    authority: mintTestTenantAuthority('tenant-1', { userId: id, role }),
  };
}

const ACCESSIBLE: FakeRows = {
  locked: { crmLeads: [{ agentId: 'agent-1' }] },
  feed: { crmActivities: [activityRow] },
};

describe('getLeadActivitiesCore access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    'member',
    'user',
    'branch_manager',
    'tenant_admin',
    'super_admin',
    'promoter',
    'auditor',
    'global_support',
  ])('refuses role %j before any read', async role => {
    useFakeTx(ACCESSIBLE);
    await expect(getLeadActivitiesCore({ ...actorAs(role), leadId: 'lead-1' })).rejects.toThrow(
      'Permission denied'
    );
    expect(withTenantAuthority).not.toHaveBeenCalled();
  });

  it('refuses a session that names another user than the authority principal', async () => {
    useFakeTx(ACCESSIBLE);
    const { authority } = actorAs('agent', 'agent-2');
    const session = { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } };

    await expect(getLeadActivitiesCore({ session, authority, leadId: 'lead-1' })).rejects.toThrow(
      'Unauthorized'
    );
    expect(withTenantAuthority).not.toHaveBeenCalled();
  });

  it('refuses a session whose role differs from the authority principal', async () => {
    useFakeTx(ACCESSIBLE);
    const { authority } = actorAs('member', 'actor-1');
    const session = { user: { id: 'actor-1', role: 'staff', tenantId: 'tenant-1' } };

    await expect(getLeadActivitiesCore({ session, authority, leadId: 'lead-1' })).rejects.toThrow(
      'Unauthorized'
    );
    expect(withTenantAuthority).not.toHaveBeenCalled();
  });

  it.each(['staff ', ' admin', 'agent\t'])(
    'refuses a padded session role (%j), although the authority stores it trimmed',
    async role => {
      useFakeTx(ACCESSIBLE);
      const { authority } = actorAs(role.trim(), 'agent-1');
      const session = { user: { id: 'agent-1', role, tenantId: 'tenant-1' } };

      await expect(getLeadActivitiesCore({ session, authority, leadId: 'lead-1' })).rejects.toThrow(
        'Unauthorized'
      );
      expect(withTenantAuthority).not.toHaveBeenCalled();
    }
  );

  it("refuses an agent on another agent's lead without reading its activities", async () => {
    const fake = useFakeTx(ACCESSIBLE);
    await expect(
      getLeadActivitiesCore({ ...actorAs('agent', 'agent-2'), leadId: 'lead-1' })
    ).rejects.toThrow('Permission denied');
    expect(fake.feedReads).toEqual([]);
  });

  it('refuses an unknown or foreign-tenant lead exactly like a foreign one', async () => {
    const fake = useFakeTx({ feed: { crmActivities: [activityRow] } });
    await expect(getLeadActivitiesCore({ ...actorAs('staff'), leadId: 'lead-mk' })).rejects.toThrow(
      'Permission denied'
    );
    expect(fake.feedReads).toEqual([]);
    expect(fake.lockedReads).toEqual([
      {
        table: 'crmLeads',
        where: expect.anything(),
        lock: 'share',
      },
    ]);
    expect(equalities(fake.lockedReads[0].where)).toEqual({
      'crmLeads.id': 'lead-mk',
      'crmLeads.tenantId': 'tenant-1',
    });
  });

  it.each([
    ['agent', 'agent-1'],
    ['staff', 'staff-1'],
    ['admin', 'admin-1'],
  ])(
    'lets %s read the activities of an accessible lead, locked in the same transaction',
    async (role, id) => {
      const fake = useFakeTx(ACCESSIBLE);
      const { authority, session } = actorAs(role, id);

      const rows = await getLeadActivitiesCore({ session, authority, leadId: 'lead-1' });

      expect(rows).toEqual([expect.objectContaining({ id: 'act-1', leadId: 'lead-1' })]);
      expect(withTenantAuthority).toHaveBeenCalledTimes(1);
      expect(withTenantAuthority.mock.calls[0][0]).toBe(authority);
      expect(fake.lockedReads.map(read => [read.table, read.lock])).toEqual([
        ['crmLeads', 'share'],
      ]);
      expect(fake.feedReads).toHaveLength(1);
      expect(equalities(fake.feedReads[0].args.where)).toEqual({
        'crmActivities.leadId': 'lead-1',
        'crmActivities.tenantId': 'tenant-1',
      });
    }
  );

  it('propagates a database failure instead of answering with no activities (R-08)', async () => {
    const failure = new Error('connection reset');
    useFakeTx({ ...ACCESSIBLE, failFeed: failure });

    await expect(getLeadActivitiesCore({ ...actorAs('staff'), leadId: 'lead-1' })).rejects.toBe(
      failure
    );
  });
});
