import { beforeEach, describe, expect, it, vi } from 'vitest';
import { campaignSelectMock } from './campaign-query.test-support';

const m = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
  dbInsert: vi.fn(),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  findManyLogs: vi.fn(),
  inArray: vi.fn((left: unknown, right: unknown[]) => ({ op: 'inArray', left, right })),
  nanoid: vi.fn(() => 'test-id-123'),
  or: vi.fn((...conditions: unknown[]) => ({ op: 'or', conditions })),
  txInsert: vi.fn(),
  txValues: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: { insert: m.dbInsert, query: { emailCampaignLogs: { findMany: m.findManyLogs } } },
  inArray: m.inArray,
  withTenantContext: m.withTenantContext,
}));
vi.mock('@interdomestik/database/schema', () => ({
  engagementEmailSends: {
    tenantId: 'engagementEmailSends.tenantId',
    userId: 'engagementEmailSends.userId',
    templateKey: 'engagementEmailSends.templateKey',
    status: 'engagementEmailSends.status',
  },
  emailCampaignLogs: {
    campaignId: 'emailCampaignLogs.campaignId',
    tenantId: 'emailCampaignLogs.tenantId',
    userId: 'emailCampaignLogs.userId',
  },
}));
vi.mock('drizzle-orm', () => ({ inArray: m.inArray, and: m.and, eq: m.eq, or: m.or }));
vi.mock('nanoid', () => ({ nanoid: m.nanoid }));

describe('campaign execution tenant-context writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.findManyLogs.mockResolvedValue([]);
    m.nanoid.mockReturnValue('test-id-123');
    m.txInsert.mockReturnValue({ values: m.txValues });
    m.txValues.mockResolvedValue(undefined);
    m.withTenantContext.mockImplementation(
      async (_context: unknown, action: (tx: unknown) => Promise<void>) =>
        await action({
          select: campaignSelectMock(m.findManyLogs),
          insert: m.txInsert,
          query: { emailCampaignLogs: { findMany: m.findManyLogs } },
        })
    );
  });
  it('writes campaign logs through each item tenant context', async () => {
    const { executeCampaign, processCampaignUser } = await import('./campaign-execution');
    const { mintTestTenantAuthority } =
      await import('@interdomestik/database/testing/tenant-authority');
    const authority1 = mintTestTenantAuthority('tenant-1');
    const authority2 = mintTestTenantAuthority('tenant-2');
    await processCampaignUser(
      { email: 'member@example.com', id: 'user-1', name: 'Member One', tenantId: 'tenant-1' },
      { campaignId: 'campaign-1', sendToUser: vi.fn().mockResolvedValue(undefined) },
      authority1,
      new Set(),
      { attempted: 0, sent: 0, skipped: 0 },
      [],
      []
    );
    await executeCampaign(
      'campaign-2',
      authority2,
      vi
        .fn()
        .mockResolvedValueOnce([
          { email: 'member@example.com', id: 'item-1', tenantId: 'tenant-2', userId: 'user-2' },
        ])
        .mockResolvedValueOnce([]),
      vi.fn().mockResolvedValue(undefined),
      { errors: [], logs: [], stats: { attempted: 0, failed: 0, sent: 0, skipped: 0 } }
    );
    expect(m.withTenantContext).toHaveBeenNthCalledWith(1, authority1, expect.any(Function));
    expect(m.withTenantContext).toHaveBeenNthCalledWith(2, authority2, expect.any(Function));
    expect(m.withTenantContext).toHaveBeenNthCalledWith(3, authority2, expect.any(Function));
    expect(m.findManyLogs).toHaveBeenCalledTimes(1);
    expect(m.txValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ campaignId: 'campaign-1', tenantId: 'tenant-1', userId: 'user-1' })
    );
    expect(m.txValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ campaignId: 'campaign-2', tenantId: 'tenant-2', userId: 'user-2' })
    );
    expect(m.dbInsert).not.toHaveBeenCalled();
  });
});
