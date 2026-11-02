import type { IngressCapability } from '@interdomestik/database/ingress';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type FakeUser,
  evaluateWhere,
  findClause,
  pageRowsByTenant,
} from './tenant-campaign-test-support';

// The producer is mocked; this stands in for the cron or Inngest entry's admitted capability.
const INGRESS = Object.freeze({}) as IngressCapability<'cron'>;
const authorities: Record<string, TenantAuthority> = {};

function authorityFor(tenantId: string): TenantAuthority {
  authorities[tenantId] ??= mintTestTenantAuthority(tenantId);
  return authorities[tenantId];
}

const h = vi.hoisted(() => ({
  events: [] as string[],
  findManyLogs: vi.fn(),
  findManyUsers: vi.fn(),
  insertValues: vi.fn(),
  listScheduledTenantWork: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  inArray: (left: unknown, right: unknown[]) => ({ left, op: 'inArray', right }),
  withTenantContext: h.withTenantContext,
  listScheduledTenantWork: h.listScheduledTenantWork,
}));

vi.mock('@interdomestik/database/schema', () => ({
  emailCampaignLogs: {
    campaignId: 'emailCampaignLogs.campaignId',
    tenantId: 'emailCampaignLogs.tenantId',
    userId: 'emailCampaignLogs.userId',
  },
}));
vi.mock('drizzle-orm', () => ({
  and: (...clauses: unknown[]) => ({ clauses, op: 'and' }),
  eq: (left: unknown, right: unknown) => ({ left, op: 'eq', right }),
}));
vi.mock('nanoid', () => ({ nanoid: () => 'id-1' }));

import {
  executeCampaign,
  getAlreadySentUserIdSet,
  getUsersBatch,
  processBatchedUserCampaign,
  processStandardUserCampaign,
} from './campaign-execution';

function scheduleTenants(tenantIds: string[]) {
  h.listScheduledTenantWork.mockResolvedValue(
    tenantIds.map(tenantId => ({ tenantId, authority: authorityFor(tenantId) }))
  );
}

function user(id: string, tenantId: string): FakeUser {
  return { email: `${id}@example.com`, id, name: id, tenantId };
}

describe('tenant-scoped campaign execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.events.length = 0;
    h.findManyLogs.mockResolvedValue([]);
    h.insertValues.mockResolvedValue(undefined);
    h.withTenantContext.mockImplementation(
      async (context: TenantAuthority, action: (tx: unknown) => Promise<unknown>) => {
        h.events.push(`ctx:${readTenantAuthority(context).tenantId}`);
        return action({
          insert: () => ({ values: h.insertValues }),
          query: {
            emailCampaignLogs: { findMany: h.findManyLogs },
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

      const sentSet = await getAlreadySentUserIdSet({
        authority,
        campaignId: 'campaign-1',
        users: [
          { id: 'a1', tenantId: 'tenant-a' },
          { id: 'x1', tenantId: 'tenant-other' },
          { id: 'n1', tenantId: null },
        ],
      });

      expect(h.withTenantContext).toHaveBeenCalledTimes(1);
      expect(h.withTenantContext.mock.calls[0][0]).toBe(authority);
      expect(h.findManyLogs).toHaveBeenCalledTimes(1);
      expect([...sentSet]).toEqual(['tenant-a:a1']);
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
