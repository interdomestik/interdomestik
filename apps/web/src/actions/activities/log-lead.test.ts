import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findLead: vi.fn(),
  dbInsertValues: vi.fn(),
  revalidatePath: vi.fn(),
  getSessionFromHeaders: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      crmLeads: {
        findFirst: mocks.findLead,
      },
    },
    insert: () => ({ values: mocks.dbInsertValues }),
  },
  crmActivities: { id: { name: 'id' }, tenantId: { name: 'tenantId' } },
  crmLeads: { id: { name: 'id' } },
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}));

vi.mock('./context', () => ({
  getSessionFromHeaders: () => mocks.getSessionFromHeaders(),
}));

import { logLeadActivityCore } from './log-lead';

describe('logLeadActivityCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findLead.mockResolvedValue({
      id: 'lead-1',
      tenantId: 'tenant_mk',
      agentId: 'agent-1',
    });
  });

  it('maps type "other" to "note" and subject to summary', async () => {
    mocks.getSessionFromHeaders.mockResolvedValue({
      user: { id: 'agent-1', role: 'agent', tenantId: 'tenant_mk' },
    });
    mocks.dbInsertValues.mockResolvedValue(undefined);

    const result = await logLeadActivityCore({
      leadId: 'lead-1',
      type: 'other',
      subject: 'Follow-up',
      description: 'Left voicemail',
    });

    expect(result).toEqual({ success: true });
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        leadId: 'lead-1',
        type: 'note',
        summary: 'Follow-up',
        description: 'Left voicemail',
      })
    );

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/agent/crm/leads/lead-1');
  });
});
