import { campaignSelectMock } from './campaign-query.test-support';
import { INGRESS, authorityFor, h, scheduleTenants, user } from './campaign-execution.test-support';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeCampaign,
  getAlreadySentUserIdSet,
  processBatchedUserCampaign,
} from './campaign-execution';

describe('tenant-scoped campaign execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.events.length = 0;
    h.findManyLogs.mockResolvedValue([]);
    h.findManySkipped.mockResolvedValue([]);
    h.insertValues.mockResolvedValue(undefined);
    h.withTenantContext.mockImplementation(
      async (context: TenantAuthority, action: (tx: unknown) => Promise<unknown>) => {
        h.events.push(`ctx:${readTenantAuthority(context).tenantId}`);
        return action({
          select: campaignSelectMock(h.findManyLogs, h.findManySkipped),
          insert: () => ({ values: h.insertValues }),
          query: {
            user: { findMany: h.findManyUsers },
          },
        });
      }
    );
  });

  describe('tenant mismatch fails closed', () => {
    it('skips and reports a batch user outside the run tenant without sending or writing', async () => {
      scheduleTenants(['tenant-a']);
      h.findManyUsers
        .mockResolvedValueOnce([user('a1', 'tenant-a'), user('x1', 'tenant-other')])
        .mockResolvedValueOnce([]);
      const sent: string[] = [];

      const result = await processBatchedUserCampaign({
        ingress: INGRESS,
        campaignId: 'campaign-1',
        sendToUser: async u => {
          sent.push(`${u.tenantId}:${u.id}`);
        },
      });

      expect(sent).toEqual(['tenant-a:a1']);
      expect(result.stats).toEqual({ attempted: 2, failed: 1, sent: 1, skipped: 1 });
      expect(result.errors).toEqual([expect.stringContaining('Tenant mismatch for userId=x1')]);
      expect(h.insertValues).toHaveBeenCalledTimes(1);
      expect(h.insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-a', userId: 'a1' })
      );
      // The dedupe query only ever asks for the run tenant's users.
      const sentQuery = h.findManyLogs.mock.calls[0][0] as {
        where: { clauses: Array<{ op: string; right: unknown }> };
      };
      expect(sentQuery.where.clauses.find(clause => clause.op === 'inArray')?.right).toEqual([
        'a1',
      ]);
    });

    it('skips and reports an executeCampaign item outside the run tenant', async () => {
      const authority = authorityFor('tenant-a');
      const processItem = vi.fn().mockResolvedValue(undefined);
      const context = {
        errors: [] as string[],
        logs: [] as string[],
        stats: { attempted: 0, failed: 0, sent: 0, skipped: 0 },
      };

      await executeCampaign(
        'campaign-1',
        authority,
        vi
          .fn()
          .mockResolvedValueOnce([
            { email: 'x@example.com', id: 'i1', tenantId: 'tenant-other', userId: 'x1' },
            { email: 'a@example.com', id: 'i2', tenantId: 'tenant-a', userId: 'a1' },
          ])
          .mockResolvedValueOnce([]),
        processItem,
        context
      );

      expect(processItem).toHaveBeenCalledTimes(1);
      expect(context.stats).toEqual({ attempted: 1, failed: 0, sent: 1, skipped: 1 });
      expect(context.errors).toEqual([expect.stringContaining('Tenant mismatch for userId=x1')]);
      expect(h.withTenantContext.mock.calls.every(call => call[0] === authority)).toBe(true);
      expect(h.insertValues).toHaveBeenCalledTimes(1);
      expect(h.insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-a', userId: 'a1' })
      );
    });

    it('keeps the missing-tenant skip for items without a tenant', async () => {
      const context = {
        errors: [] as string[],
        logs: [] as string[],
        stats: { attempted: 0, failed: 0, sent: 0, skipped: 0 },
      };

      await executeCampaign(
        'campaign-1',
        authorityFor('tenant-a'),
        vi
          .fn()
          .mockResolvedValueOnce([
            { email: 'n@example.com', id: 'i1', tenantId: null, userId: 'n1' },
          ])
          .mockResolvedValueOnce([]),
        vi.fn(),
        context
      );

      expect(context.stats.skipped).toBe(1);
      expect(context.errors).toEqual([expect.stringContaining('Missing tenantId for userId=n1')]);
      expect(h.insertValues).not.toHaveBeenCalled();
    });
  });

  describe('getAlreadySentUserIdSet', () => {
    it('makes one query under the given authority and keys results by tenant and user', async () => {
      const authority = authorityFor('tenant-a');
      h.findManyLogs.mockResolvedValue([{ tenantId: 'tenant-a', userId: 'a1' }]);
      h.findManySkipped.mockResolvedValue([{ tenantId: 'tenant-a', userId: 'a2' }]);

      const sentSet = await getAlreadySentUserIdSet({
        authority,
        campaignId: 'campaign-1',
        users: [
          { id: 'a1', tenantId: 'tenant-a' },
          { id: 'a2', tenantId: 'tenant-a' },
          { id: 'x1', tenantId: 'tenant-other' },
          { id: 'n1', tenantId: null },
        ],
      });

      expect(h.withTenantContext).toHaveBeenCalledTimes(1);
      expect(h.withTenantContext.mock.calls[0][0]).toBe(authority);
      expect(h.findManyLogs).toHaveBeenCalledTimes(1);
      expect(h.findManySkipped).toHaveBeenCalledTimes(1);
      expect([...sentSet]).toEqual(['tenant-a:a1', 'tenant-a:a2']);
    });

    it('does not query when no user belongs to the authority tenant', async () => {
      const sentSet = await getAlreadySentUserIdSet({
        authority: authorityFor('tenant-a'),
        campaignId: 'campaign-1',
        users: [{ id: 'x1', tenantId: 'tenant-other' }],
      });

      expect(sentSet.size).toBe(0);
      expect(h.withTenantContext).not.toHaveBeenCalled();
    });
  });
});
