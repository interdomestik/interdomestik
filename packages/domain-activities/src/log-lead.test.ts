import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  equalities,
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

import { logLeadActivityCore } from './log-lead';

const validData = { leadId: 'lead-1', type: 'call' as const, subject: 'Called lead' };
const OWN_LEAD: FakeRows = { locked: { crmLeads: [{ agentId: 'agent-1' }] } };

function actorAs(role: string, id = 'agent-1') {
  return {
    session: { user: { id, role, tenantId: 't1' as string | undefined } },
    authority: mintTestTenantAuthority('t1', { userId: id, role }),
  };
}

describe('logLeadActivityCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails if unauthorized (no session)', async () => {
    const result = await logLeadActivityCore({ session: null, authority: null, data: validData });
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it.each(['member', 'user', 'branch_manager', 'tenant_admin', 'auditor', 'global_support'])(
    'refuses role %j before any read or write',
    async role => {
      useFakeTx(OWN_LEAD);
      const result = await logLeadActivityCore({ ...actorAs(role), data: validData });
      expect(result).toEqual({ success: false, error: 'Permission denied: insufficient role' });
      expect(withTenantAuthority).not.toHaveBeenCalled();
    }
  );

  it('fails if missing tenantId', async () => {
    const { session, authority } = actorAs('agent');
    session.user.tenantId = undefined;
    const result = await logLeadActivityCore({ session, authority, data: validData });
    expect(result).toEqual({ success: false, error: 'Missing tenantId' });
  });

  it('refuses a session that names another user than the authority principal', async () => {
    useFakeTx(OWN_LEAD);
    const { authority } = actorAs('agent', 'agent-2');
    const session = { user: { id: 'agent-1', role: 'agent', tenantId: 't1' } };

    const result = await logLeadActivityCore({ session, authority, data: validData });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(withTenantAuthority).not.toHaveBeenCalled();
  });

  it('fails validation (Zod) on empty subject', async () => {
    const fake = useFakeTx(OWN_LEAD);
    const result = await logLeadActivityCore({
      ...actorAs('agent'),
      data: { ...validData, subject: '' },
    });
    expect(result).toEqual({ success: false, error: 'Validation failed: Subject is required' });
    expect(fake.inserts).toEqual([]);
  });

  it.each([{ tenantId: 't2' }, { agentId: 'forged' }, { id: 'forged-id' }])(
    'refuses an input naming an identity (%o) before any read or write',
    async injected => {
      const fake = useFakeTx(OWN_LEAD);
      const result = await logLeadActivityCore({
        ...actorAs('agent'),
        data: { ...validData, ...injected } as typeof validData,
      });
      expect(result).toMatchObject({ success: false });
      expect(String(result.error)).toMatch(/^Validation failed: /);
      expect(withTenantAuthority).not.toHaveBeenCalled();
      expect(fake.inserts).toEqual([]);
    }
  );

  it('denies when the lead is not found in the tenant, without writing', async () => {
    const fake = useFakeTx({});

    const result = await logLeadActivityCore({ ...actorAs('agent'), data: validData });

    expect(result).toEqual({ success: false, error: 'Lead access denied' });
    expect(fake.inserts).toEqual([]);
    expect(equalities(fake.lockedReads[0].where)).toEqual({
      'crmLeads.id': 'lead-1',
      'crmLeads.tenantId': 't1',
    });
  });

  it('denies agent when lead belongs to another agent, without writing', async () => {
    const fake = useFakeTx({ locked: { crmLeads: [{ agentId: 'agent-2' }] } });

    const result = await logLeadActivityCore({ ...actorAs('agent'), data: validData });

    expect(result).toEqual({ success: false, error: 'Lead access denied' });
    expect(fake.inserts).toEqual([]);
  });

  it.each([
    ['agent', 'agent-1'],
    ['staff', 'staff-1'],
    ['admin', 'admin-1'],
  ])(
    'lets %s log on an accessible lead, the lead locked in the writing transaction',
    async (role, id) => {
      const fake = useFakeTx(OWN_LEAD);
      const { session, authority } = actorAs(role, id);

      const result = await logLeadActivityCore({
        session,
        authority,
        data: validData,
      });

      expect(result).toEqual({ success: true, error: undefined });
      expect(withTenantAuthority).toHaveBeenCalledTimes(1);
      expect(withTenantAuthority.mock.calls[0][0]).toBe(authority);
      expect(fake.lockedReads.map(read => [read.table, read.lock])).toEqual([
        ['crmLeads', 'share'],
      ]);
      expect(fake.inserts).toEqual([
        {
          table: 'crmActivities',
          values: expect.objectContaining({
            id: ACTIVITY_ID,
            tenantId: 't1',
            agentId: id,
            leadId: 'lead-1',
            summary: 'Called lead',
          }),
        },
      ]);
    }
  );

  it('maps type "other" to "note" and the subject to the summary', async () => {
    const fake = useFakeTx(OWN_LEAD);

    const result = await logLeadActivityCore({
      ...actorAs('agent'),
      data: {
        leadId: 'lead-1',
        type: 'other',
        subject: 'Follow-up',
        description: 'Left voicemail',
      },
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(fake.inserts[0]?.values).toEqual(
      expect.objectContaining({
        type: 'note',
        summary: 'Follow-up',
        description: 'Left voicemail',
      })
    );
  });

  it('answers a typed failure when the write fails', async () => {
    useFakeTx(OWN_LEAD);
    withTenantAuthority.mockRejectedValueOnce(new Error('connection reset'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await logLeadActivityCore({ ...actorAs('agent'), data: validData });

    expect(result).toEqual({ success: false, error: 'Failed to log activity.' });
  });
});
