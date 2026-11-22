import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeTx, equalities, type FakeRows } from './test/activity-tx';

const mocks = vi.hoisted(() => ({ withTenantAuthority: vi.fn(), execute: vi.fn() }));
const { execute } = mocks;

// The probe double is hoisted: vi.resetModules() re-creates the support module between tests.
vi.mock('@interdomestik/database', async () => ({
  ...(await import('./test/activity-tx')).databaseMock,
  db: { execute: (...args: unknown[]) => mocks.execute(...args) },
}));
vi.mock('drizzle-orm', async () => (await import('./test/activity-tx')).drizzleMock);
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: (...args: unknown[]) => mocks.withTenantAuthority(...args),
}));

// The core caches a confirmed probe answer, so each test re-imports it after vi.resetModules();
// the authority is minted in the same module registry the core reads it from.
async function loadCore() {
  const [{ getMemberActivitiesCore }, { mintTestTenantAuthority }] = await Promise.all([
    import('./get-member'),
    import('@interdomestik/database/testing/tenant-authority'),
  ]);
  const actorAs = (role: string, id = 'actor-1') => ({
    session: { user: { id, role, tenantId: 'tenant-1' } },
    authority: mintTestTenantAuthority('tenant-1', { userId: id, role }),
  });
  return { getMemberActivitiesCore, actorAs };
}

function useTx(rows: FakeRows) {
  const fake = createFakeTx(rows);
  mocks.withTenantAuthority.mockImplementation(
    (_authority: unknown, callback: (tx: unknown) => unknown) => Promise.resolve(callback(fake.tx))
  );
  return fake;
}

const TABLE_PRESENT = [{ regclass: 'member_activities' }];
const FEED = { memberActivities: [{ id: 'a1' }] };

describe('getMemberActivitiesCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    execute.mockResolvedValue(TABLE_PRESENT);
  });

  it('returns [] without a tenant read when the member_activities table is confirmed absent', async () => {
    execute.mockResolvedValue([{ regclass: null }]);
    const { getMemberActivitiesCore, actorAs } = await loadCore();

    const result = await getMemberActivitiesCore({
      ...actorAs('agent', 'agent-1'),
      memberId: 'member-1',
    });

    expect(result).toEqual([]);
    expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
  });

  it('reads tenant-scoped activities for the directly linked agent, member row locked', async () => {
    const fake = useTx({ locked: { user: [{ agentId: 'agent-1' }] }, feed: FEED });
    const { getMemberActivitiesCore, actorAs } = await loadCore();
    const actor = actorAs('agent', 'agent-1');

    const result = await getMemberActivitiesCore({ ...actor, memberId: 'member-1' });

    expect(result).toEqual([{ id: 'a1' }]);
    expect(mocks.withTenantAuthority).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantAuthority.mock.calls[0][0]).toBe(actor.authority);
    expect(fake.lockedReads.map(read => [read.table, read.lock])).toEqual([['user', 'share']]);
    expect(equalities(fake.lockedReads[0].where)).toEqual({
      'user.id': 'member-1',
      'user.tenantId': 'tenant-1',
    });
    expect(equalities(fake.feedReads[0].args.where)).toEqual({
      'memberActivities.memberId': 'member-1',
      'memberActivities.tenantId': 'tenant-1',
    });
  });

  it('allows an active agent-client assignment, locked, when user.agentId is not mirrored', async () => {
    const fake = useTx({
      locked: { user: [{ agentId: 'legacy-agent' }], agentClients: [{ id: 'assignment-1' }] },
      feed: FEED,
    });
    const { getMemberActivitiesCore, actorAs } = await loadCore();

    const result = await getMemberActivitiesCore({
      ...actorAs('agent', 'agent-1'),
      memberId: 'member-1',
    });

    expect(result).toEqual([{ id: 'a1' }]);
    expect(fake.lockedReads.map(read => [read.table, read.lock])).toEqual([
      ['user', 'share'],
      ['agentClients', 'share'],
    ]);
    expect(equalities(fake.lockedReads[1].where)).toEqual({
      'agentClients.tenantId': 'tenant-1',
      'agentClients.agentId': 'agent-1',
      'agentClients.memberId': 'member-1',
      'agentClients.status': 'active',
    });
  });

  it('denies an unassigned agent without reading activities', async () => {
    const fake = useTx({ locked: { user: [{ agentId: 'agent-2' }] }, feed: FEED });
    const { getMemberActivitiesCore, actorAs } = await loadCore();

    await expect(
      getMemberActivitiesCore({ ...actorAs('agent', 'agent-1'), memberId: 'member-1' })
    ).rejects.toThrow('Permission denied');
    expect(fake.feedReads).toEqual([]);
  });

  it('denies a member that is not in the tenant without reading activities', async () => {
    const fake = useTx({ feed: FEED });
    const { getMemberActivitiesCore, actorAs } = await loadCore();

    await expect(
      getMemberActivitiesCore({ ...actorAs('staff', 'staff-1'), memberId: 'member-mk' })
    ).rejects.toThrow('Permission denied');
    expect(fake.feedReads).toEqual([]);
  });

  it('propagates a failure of the access check instead of answering with no activities', async () => {
    const failure = new Error('lookup failed');
    mocks.withTenantAuthority.mockRejectedValue(failure);
    const { getMemberActivitiesCore, actorAs } = await loadCore();

    await expect(
      getMemberActivitiesCore({ ...actorAs('agent', 'agent-1'), memberId: 'member-1' })
    ).rejects.toBe(failure);
  });

  it.each(['member', 'user'])(
    'lets a %s read its own activities without a member lookup',
    async role => {
      const fake = useTx({ feed: FEED });
      const { getMemberActivitiesCore, actorAs } = await loadCore();

      const result = await getMemberActivitiesCore({
        ...actorAs(role, 'member-1'),
        memberId: 'member-1',
      });

      expect(result).toEqual([{ id: 'a1' }]);
      expect(fake.lockedReads).toEqual([]);
    }
  );

  it.each(['member', 'user'])(
    "refuses a %s reading another member's activities before any read",
    async role => {
      const { getMemberActivitiesCore, actorAs } = await loadCore();

      await expect(
        getMemberActivitiesCore({ ...actorAs(role, 'member-2'), memberId: 'member-1' })
      ).rejects.toThrow('Permission denied');
      expect(execute).not.toHaveBeenCalled();
      expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
    }
  );

  it.each(['branch_manager', 'promoter', 'auditor', 'global_support', 'unknown_role'])(
    'refuses role %j before the table probe or any read',
    async role => {
      const { getMemberActivitiesCore, actorAs } = await loadCore();

      await expect(
        getMemberActivitiesCore({ ...actorAs(role), memberId: 'member-1' })
      ).rejects.toThrow('Permission denied');
      expect(execute).not.toHaveBeenCalled();
      expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
    }
  );

  it('refuses a session that names another user than the authority principal', async () => {
    const { getMemberActivitiesCore, actorAs } = await loadCore();
    const { authority } = actorAs('staff', 'staff-2');

    await expect(
      getMemberActivitiesCore({
        session: { user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' } },
        authority,
        memberId: 'member-1',
      })
    ).rejects.toThrow('Unauthorized');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['staff', 'admin', 'tenant_admin', 'super_admin'])(
    'lets %s read a member of its tenant without an agent assignment',
    async role => {
      const fake = useTx({ locked: { user: [{ agentId: 'someone' }] }, feed: FEED });
      const { getMemberActivitiesCore, actorAs } = await loadCore();

      const result = await getMemberActivitiesCore({ ...actorAs(role), memberId: 'member-1' });

      expect(result).toEqual([{ id: 'a1' }]);
      expect(fake.lockedReads.map(read => read.table)).toEqual(['user']);
    }
  );
});
