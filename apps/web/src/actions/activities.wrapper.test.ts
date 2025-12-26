import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logActivityCore: vi.fn(),
  getMemberActivitiesCore: vi.fn(),
  logLeadActivityCore: vi.fn(),
  getLeadActivitiesCore: vi.fn(),
}));

vi.mock('./activities/log-member', () => ({
  logActivityCore: (...args: unknown[]) => mocks.logActivityCore(...args),
}));

vi.mock('./activities/get-member', () => ({
  getMemberActivitiesCore: (...args: unknown[]) => mocks.getMemberActivitiesCore(...args),
}));

vi.mock('./activities/log-lead', () => ({
  logLeadActivityCore: (...args: unknown[]) => mocks.logLeadActivityCore(...args),
}));

vi.mock('./activities/get-lead', () => ({
  getLeadActivitiesCore: (...args: unknown[]) => mocks.getLeadActivitiesCore(...args),
}));

let actions: typeof import('./activities');

describe('activities action wrappers', () => {
  beforeAll(async () => {
    actions = await import('./activities');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logActivity delegates to core', async () => {
    mocks.logActivityCore.mockResolvedValue({ success: true });

    const result = await actions.logActivity({
      memberId: 'm1',
      type: 'call',
      subject: 'Hello',
      description: 'Notes',
    });

    expect(mocks.logActivityCore).toHaveBeenCalledWith({
      memberId: 'm1',
      type: 'call',
      subject: 'Hello',
      description: 'Notes',
    });
    expect(result).toEqual({ success: true });
  });

  it('getMemberActivities delegates to core', async () => {
    mocks.getMemberActivitiesCore.mockResolvedValue([{ id: 'a1' }]);

    const result = await actions.getMemberActivities('m1');

    expect(mocks.getMemberActivitiesCore).toHaveBeenCalledWith('m1');
    expect(result).toEqual([{ id: 'a1' }]);
  });

  it('logLeadActivity delegates to core', async () => {
    mocks.logLeadActivityCore.mockResolvedValue({ success: true });

    const result = await actions.logLeadActivity({
      leadId: 'l1',
      type: 'other',
      subject: 'Subject',
      description: 'Desc',
    });

    expect(mocks.logLeadActivityCore).toHaveBeenCalledWith({
      leadId: 'l1',
      type: 'other',
      subject: 'Subject',
      description: 'Desc',
    });
    expect(result).toEqual({ success: true });
  });

  it('getLeadActivities delegates to core', async () => {
    mocks.getLeadActivitiesCore.mockResolvedValue([{ id: 'a1' }]);

    const result = await actions.getLeadActivities('l1');

    expect(mocks.getLeadActivitiesCore).toHaveBeenCalledWith('l1');
    expect(result).toEqual([{ id: 'a1' }]);
  });
});
