import { INGRESS, authorityFor, h, scheduleTenants, user } from './campaign-execution.test-support';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateWhere, findClause, pageRowsByTenant } from './tenant-campaign-test-support';
import {
  getUsersBatch,
  processBatchedUserCampaign,
  processStandardUserCampaign,
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
          insert: () => ({ values: h.insertValues }),
          query: {
            emailCampaignLogs: { findMany: h.findManyLogs },
            engagementEmailSends: { findMany: h.findManySkipped },
            user: { findMany: h.findManyUsers },
          },
        });
      }
    );
  });

  describe('getUsersBatch', () => {
    it('reads inside the given tenant authority with a tenant predicate and an id cursor', async () => {
      h.findManyUsers.mockResolvedValue([user('u9', 'tenant-a')]);
      const authority = authorityFor('tenant-a');

      const result = await getUsersBatch({ afterId: 'u5', limit: 25, authority });

      expect(h.withTenantContext).toHaveBeenCalledTimes(1);
      expect(h.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
      expect(h.withTenantContext.mock.calls[0][0]).toBe(authority);
      const options = h.findManyUsers.mock.calls[0][0] as {
        columns: unknown;
        limit: number;
        orderBy: (table: never, operators: { asc: (c: unknown) => unknown }) => unknown[];
        where: unknown;
      };
      const where = evaluateWhere(options.where, 'user');
      expect(findClause(where, 'eq', 'user.tenantId')).toEqual({ right: 'tenant-a' });
      expect(findClause(where, 'gt', 'user.id')).toEqual({ right: 'u5' });
      expect(options.limit).toBe(25);
      expect(options.columns).toEqual({ email: true, id: true, name: true, tenantId: true });
      expect(options.orderBy({ id: 'user.id' } as never, { asc: c => `asc:${String(c)}` })).toEqual(
        ['asc:user.id']
      );
      expect(result).toEqual([
        { email: 'u9@example.com', id: 'u9', name: 'u9', tenantId: 'tenant-a' },
      ]);
    });

    it('keeps the tenant predicate and drops the cursor on the first page', async () => {
      h.findManyUsers.mockResolvedValue([]);

      await getUsersBatch({ afterId: null, authority: authorityFor('tenant-b') });

      const options = h.findManyUsers.mock.calls[0][0] as { limit: number; where: unknown };
      const where = evaluateWhere(options.where, 'user');
      expect(findClause(where, 'eq', 'user.tenantId')).toEqual({ right: 'tenant-b' });
      expect(findClause(where, 'gt', 'user.id')).toBeUndefined();
      expect(options.limit).toBe(500);
    });
  });

  describe('processBatchedUserCampaign', () => {
    it('iterates tenants one at a time with an independent cursor per tenant', async () => {
      scheduleTenants(['tenant-a', 'tenant-b']);
      const rowsByTenant = {
        'tenant-a': [user('a1', 'tenant-a'), user('a2', 'tenant-a'), user('a3', 'tenant-a')],
        'tenant-b': [user('b1', 'tenant-b')],
      };
      const pages: Array<[string, string | null]> = [];
      h.findManyUsers.mockImplementation(async (options: { where: unknown }) => {
        const page = pageRowsByTenant(rowsByTenant, options.where, 'user', 2);
        pages.push([page.tenantId, page.afterId]);
        return page.rows;
      });
      const sent: string[] = [];

      const result = await processBatchedUserCampaign({
        ingress: INGRESS,
        campaignId: 'campaign-1',
        sendToUser: async u => {
          sent.push(`${u.tenantId}:${u.id}`);
        },
      });

      expect(h.listScheduledTenantWork).toHaveBeenCalledTimes(1);
      expect(h.listScheduledTenantWork).toHaveBeenCalledWith(INGRESS);
      expect(pages).toEqual([
        ['tenant-a', null],
        ['tenant-a', 'a2'],
        ['tenant-a', 'a3'],
        ['tenant-b', null],
        ['tenant-b', 'b1'],
      ]);
      expect(sent).toEqual(['tenant-a:a1', 'tenant-a:a2', 'tenant-a:a3', 'tenant-b:b1']);
      expect(result.stats).toEqual({ attempted: 4, failed: 0, sent: 4, skipped: 0 });
      expect(h.insertValues).toHaveBeenCalledTimes(4);
      // Tenant b is never read before tenant a's cursor is exhausted.
      const firstTenantB = h.events.indexOf('ctx:tenant-b');
      expect(h.events.slice(0, firstTenantB).every(event => event === 'ctx:tenant-a')).toBe(true);
      expect(new Set(h.events)).toEqual(new Set(['ctx:tenant-a', 'ctx:tenant-b']));
      // Every context received the exact token the producer minted for that tenant.
      for (const call of h.withTenantContext.mock.calls) {
        expect(call[0]).toBe(authorityFor(readTenantAuthority(call[0]).tenantId));
      }
    });

    it('does nothing when there are no tenants', async () => {
      scheduleTenants([]);

      const result = await processBatchedUserCampaign({
        ingress: INGRESS,
        campaignId: 'campaign-1',
        sendToUser: vi.fn(),
      });

      expect(h.withTenantContext).not.toHaveBeenCalled();
      expect(result.stats).toEqual({ attempted: 0, failed: 0, sent: 0, skipped: 0 });
      expect(h.findManyUsers).not.toHaveBeenCalled();
    });
  });

  describe('processStandardUserCampaign', () => {
    it('runs one tenant-bound campaign per tenant with the window and a fresh cursor', async () => {
      scheduleTenants(['tenant-a', 'tenant-b']);
      const windowStart = new Date('2026-01-01T00:00:00.000Z');
      const windowEnd = new Date('2026-01-01T23:59:59.999Z');
      const rowsByTenant = {
        'tenant-a': [user('a1', 'tenant-a')],
        'tenant-b': [user('b1', 'tenant-b'), user('b2', 'tenant-b')],
      };
      const pages: Array<[string, string | null, unknown]> = [];
      h.findManyUsers.mockImplementation(async (options: { where: unknown }) => {
        const page = pageRowsByTenant(rowsByTenant, options.where, 'user', 1);
        const window = findClause(
          evaluateWhere(options.where, 'user'),
          'between',
          'user.createdAt'
        );
        pages.push([page.tenantId, page.afterId, window?.right]);
        return page.rows;
      });
      const context = {
        errors: [] as string[],
        logs: [] as string[],
        stats: { attempted: 0, failed: 0, sent: 0, skipped: 0 },
      };
      const sent: string[] = [];

      await processStandardUserCampaign(
        INGRESS,
        'checkin_day_14',
        windowStart,
        windowEnd,
        context,
        async u => {
          sent.push(`${u.tenantId}:${u.id}`);
        }
      );

      expect(pages).toEqual([
        ['tenant-a', null, [windowStart, windowEnd]],
        ['tenant-a', 'a1', [windowStart, windowEnd]],
        ['tenant-b', null, [windowStart, windowEnd]],
        ['tenant-b', 'b1', [windowStart, windowEnd]],
        ['tenant-b', 'b2', [windowStart, windowEnd]],
      ]);
      expect(h.listScheduledTenantWork).toHaveBeenCalledWith(INGRESS);
      expect(sent).toEqual(['tenant-a:a1', 'tenant-b:b1', 'tenant-b:b2']);
      expect(context.stats.sent).toBe(3);
      expect(context.errors).toEqual([]);
    });
  });
  it('persists batched suppression and never sends that campaign again', async () => {
    scheduleTenants(['tenant-a']);
    h.findManyLogs.mockResolvedValue([]);
    h.findManySkipped.mockResolvedValue([]);
    h.findManyUsers.mockResolvedValueOnce([user('u1', 'tenant-a')]).mockResolvedValue([]);
    h.insertValues.mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
    const sendToUser = vi.fn().mockResolvedValue('skipped');
    const args = { ingress: INGRESS, campaignId: 'winter', sendToUser };
    const first = await processBatchedUserCampaign(args);
    expect(first.stats).toMatchObject({ sent: 0, skipped: 1, failed: 0 });
    expect(first.errors).toEqual([]);
    expect(first.logs).toEqual([]);
    expect(h.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'skipped', sentAt: null })
    );
    h.findManySkipped.mockResolvedValue([{ tenantId: 'tenant-a', userId: 'u1' }]);
    h.findManyUsers.mockResolvedValueOnce([user('u1', 'tenant-a')]);
    const replay = await processBatchedUserCampaign(args);
    expect(replay.stats).toMatchObject({ sent: 0, skipped: 1, failed: 0 });
    expect(sendToUser).toHaveBeenCalledTimes(1);
  });
});
