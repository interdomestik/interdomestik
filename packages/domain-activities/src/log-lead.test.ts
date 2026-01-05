import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logLeadActivityCore } from './log-lead';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  nanoid: vi.fn(() => 'ACT-123'),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    insert: mocks.insert,
  },
  crmActivities: {
    id: 'crmActivities.id',
    leadId: 'crmActivities.leadId',
  },
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

describe('logLeadActivityCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(result).toEqual({ error: 'Unauthorized' });
  });

  it('fails if user is member', async () => {
    const result = await logLeadActivityCore({
      session: { user: { role: 'member', tenantId: 't1' } } as any,
      data: validData,
    });
    expect(result).toEqual({ error: 'Permission denied: insufficient role' });
  });

  it('fails if missing tenantId', async () => {
    const result = await logLeadActivityCore({
      session: { user: { role: 'agent' } } as any, // Missing tenantId
      data: validData,
    });
    expect(result).toEqual({ error: 'Missing tenantId' });
  });

  it('fails validation (Zod) on empty subject', async () => {
    const result = await logLeadActivityCore({
      session: validSession,
      data: { ...validData, subject: '' },
    });
    expect(result).toEqual({ error: 'Validation failed: Subject is required' });
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
