import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  equalities,
  execute,
  type FakeRows,
  useFakeTx,
  withTenantAuthority,
  ACTIVITY_ID,
} from './test/activity-tx';

vi.mock('@interdomestik/database', async () => (await import('./test/activity-tx')).databaseMock);
vi.mock('drizzle-orm', async () => (await import('./test/activity-tx')).drizzleMock);
vi.mock(
  '@interdomestik/database/tenant-authority-context',
  async () => (await import('./test/activity-tx')).tenantContextMock
);
vi.mock('nanoid', async () => (await import('./test/activity-tx')).nanoidMock);

import { logActivityCore } from './log-member';

const validData = { memberId: 'member-1', type: 'call' as const, subject: 'Called member' };
const LINKED_MEMBER: FakeRows = { locked: { user: [{ agentId: 'agent-1' }] } };

function actorAs(role: string, id = 'agent-1') {
  return {
    session: { user: { id, role, tenantId: 'tenant-1' } },
    authority: mintTestTenantAuthority('tenant-1', { userId: id, role }),
  };
}

describe('logActivityCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockResolvedValue([{ regclass: 'member_activities' }]);
  });

  it('denies a member that is not in the tenant, without writing', async () => {
    const fake = useFakeTx({});

    const result = await logActivityCore({ ...actorAs('agent'), data: validData });

    expect(result).toEqual({ success: false, error: 'Member access denied' });
    expect(fake.inserts).toEqual([]);
    expect(equalities(fake.lockedReads[0].where)).toEqual({
      'user.id': 'member-1',
      'user.tenantId': 'tenant-1',
    });
  });

  it('denies agent writes for an unassigned member, without writing', async () => {
    const fake = useFakeTx({ locked: { user: [{ agentId: 'agent-2' }] } });

    const result = await logActivityCore({ ...actorAs('agent'), data: validData });

    expect(result).toEqual({ success: false, error: 'Member access denied' });
    expect(fake.inserts).toEqual([]);
  });

  it('allows an agent with an active client assignment, both rows locked in the writing transaction', async () => {
    const fake = useFakeTx({
      locked: { user: [{ agentId: 'legacy-agent' }], agentClients: [{ id: 'assignment-1' }] },
    });

    const result = await logActivityCore({ ...actorAs('agent'), data: validData });

    expect(result).toEqual({ success: true, error: undefined });
    expect(withTenantAuthority).toHaveBeenCalledTimes(1);
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
    expect(fake.inserts).toHaveLength(1);
  });

  it.each([{ tenantId: 'tenant-2' }, { agentId: 'forged-agent' }, { id: 'forged-id' }])(
    'refuses an input naming an identity (%o) before any read or write',
    async injected => {
      const fake = useFakeTx(LINKED_MEMBER);

      const result = await logActivityCore({
        ...actorAs('agent'),
        data: { ...validData, ...injected } as typeof validData,
      });

      expect(result).toEqual({ success: false, error: 'Validation failed' });
      expect(withTenantAuthority).not.toHaveBeenCalled();
      expect(fake.inserts).toEqual([]);
    }
  );

  it('writes the activity for the linked agent, identity and tenant from the authority', async () => {
    const fake = useFakeTx(LINKED_MEMBER);
    const actor = actorAs('agent');

    const result = await logActivityCore({ ...actor, data: validData });

    expect(result).toEqual({ success: true, error: undefined });
    expect(withTenantAuthority.mock.calls[0][0]).toBe(actor.authority);
    expect(fake.inserts).toEqual([
      {
        table: 'memberActivities',
        values: expect.objectContaining({
          id: ACTIVITY_ID,
          tenantId: 'tenant-1',
          agentId: 'agent-1',
          memberId: 'member-1',
          subject: 'Called member',
        }),
      },
    ]);
  });

  it.each([
    'member',
    'user',
    'branch_manager',
    'promoter',
    'auditor',
    'global_support',
    'unknown_role',
  ])('refuses role %j before any read or write', async role => {
    useFakeTx(LINKED_MEMBER);
    const result = await logActivityCore({ ...actorAs(role, 'actor-1'), data: validData });

    expect(result).toEqual({ success: false, error: 'Permission denied' });
    expect(execute).not.toHaveBeenCalled();
    expect(withTenantAuthority).not.toHaveBeenCalled();
  });

  it('refuses a session that names another user than the authority principal', async () => {
    useFakeTx(LINKED_MEMBER);
    const { authority } = actorAs('agent', 'agent-2');

    const result = await logActivityCore({
      session: { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } },
      authority,
      data: validData,
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(withTenantAuthority).not.toHaveBeenCalled();
  });

  it.each(['staff', 'admin', 'tenant_admin', 'super_admin'])(
    'lets %s log for a member of its tenant without an assignment check',
    async role => {
      const fake = useFakeTx({ locked: { user: [{ agentId: 'someone' }] } });

      const result = await logActivityCore({ ...actorAs(role, 'actor-1'), data: validData });

      expect(result).toEqual({ success: true, error: undefined });
      expect(fake.lockedReads.map(read => read.table)).toEqual(['user']);
      expect(fake.inserts[0].values).toMatchObject({ agentId: 'actor-1', tenantId: 'tenant-1' });
    }
  );

  // The probe is unchanged (pinned by the tenant guard): a failed probe reads as an absent table.
  it('answers a typed failure and writes nothing when the table probe fails', async () => {
    useFakeTx(LINKED_MEMBER);
    execute.mockRejectedValue(new Error('probe failed'));

    const result = await logActivityCore({ ...actorAs('agent'), data: validData });

    expect(result).toEqual({ success: false, error: 'Activity log unavailable' });
    expect(withTenantAuthority).not.toHaveBeenCalled();
  });
});
