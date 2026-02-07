import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logLeadActivityCore } from './log-lead';

const mocks = vi.hoisted(() => ({
  findLead: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  nanoid: vi.fn(() => 'ACT-123'),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      crmLeads: {
        findFirst: mocks.findLead,
      },
    },
    insert: mocks.insert,
  },
  crmActivities: {
    id: 'crmActivities.id',
    leadId: 'crmActivities.leadId',
  },
  crmLeads: {
    id: 'crmLeads.id',
  },
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

describe('logLeadActivityCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findLead.mockResolvedValue({
      id: 'lead-1',
      tenantId: 't1',
      agentId: 'agent-1',
    });
    mocks.insert.mockReturnValue({ values: mocks.values });
  });

  const validData = {
    leadId: 'lead-1',
    type: 'call' as const,
    subject: 'Called lead',
  };

  const validSession = {
    user: { id: 'agent-1', role: 'agent', tenantId: 't1' },
  } as any;

  it('fails if unauthorized (no session)', async () => {
    const result = await logLeadActivityCore({ session: null, data: validData });
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('fails if user is member', async () => {
    const result = await logLeadActivityCore({
      session: { user: { role: 'member', tenantId: 't1' } } as any,
      data: validData,
    });
    expect(result).toEqual({ success: false, error: 'Permission denied: insufficient role' });
  });

  it('fails if missing tenantId', async () => {
    const result = await logLeadActivityCore({
      session: { user: { role: 'agent' } } as any, // Missing tenantId
      data: validData,
    });
    expect(result).toEqual({ success: false, error: 'Missing tenantId' });
  });

  it('fails validation (Zod) on empty subject', async () => {
    const result = await logLeadActivityCore({
      session: validSession,
      data: { ...validData, subject: '' },
    });
    expect(result).toEqual({ success: false, error: 'Validation failed: Subject is required' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('denies when lead is in a different tenant', async () => {
    mocks.findLead.mockResolvedValue({
      id: 'lead-1',
      tenantId: 't2',
      agentId: 'agent-1',
    });

    const result = await logLeadActivityCore({
      session: validSession,
      data: validData,
    });

    expect(result).toEqual({ success: false, error: 'Lead access denied' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('denies agent when lead belongs to another agent', async () => {
    mocks.findLead.mockResolvedValue({
      id: 'lead-1',
      tenantId: 't1',
      agentId: 'agent-2',
    });

    const result = await logLeadActivityCore({
      session: validSession,
      data: validData,
    });

    expect(result).toEqual({ success: false, error: 'Lead access denied' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('logs activity if valid', async () => {
    const result = await logLeadActivityCore({
      session: validSession,
      data: validData,
    });

    expect(result).toEqual({ success: true });
    expect(mocks.insert).toHaveBeenCalled();
    const inserted = mocks.values.mock.calls[0][0];
    expect(inserted).toMatchObject({
      id: 'ACT-123',
      tenantId: 't1',
      leadId: 'lead-1',
      summary: 'Called lead',
    });
  });
});
