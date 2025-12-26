import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbInsertValues: vi.fn(),
  revalidatePath: vi.fn(),
  getSessionFromHeaders: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    insert: () => ({ values: mocks.dbInsertValues }),
  },
  crmActivities: {},
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
  });

  it('maps type "other" to "note" and subject to summary', async () => {
    mocks.getSessionFromHeaders.mockResolvedValue({
      user: { id: 'agent-1', role: 'agent' },
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
