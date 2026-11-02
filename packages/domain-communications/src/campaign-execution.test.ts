import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type FakeUser,
  evaluateWhere,
  findClause,
  pageRowsByTenant,
} from './tenant-campaign-test-support';

type TenantContext = { tenantId: string; role: string };

const h = vi.hoisted(() => ({
  events: [] as string[],
  findManyLogs: vi.fn(),
  findManyUsers: vi.fn(),
  insertValues: vi.fn(),
  listTenantIdsForScheduledWork: vi.fn<() => Promise<string[]>>(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  inArray: (left: unknown, right: unknown[]) => ({ left, op: 'inArray', right }),
  withTenantContext: h.withTenantContext,
  listTenantIdsForScheduledWork: h.listTenantIdsForScheduledWork,
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
  getUsersBatch,
  processBatchedUserCampaign,
  processStandardUserCampaign,
} from './campaign-execution';

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
      async (context: TenantContext, action: (tx: unknown) => Promise<unknown>) => {
        h.events.push(`ctx:${context.tenantId}:${context.role}`);
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
    it('reads inside the tenant system context with a tenant predicate and an id cursor', async () => {
      h.findManyUsers.mockResolvedValue([user('u9', 'tenant-a')]);

      const result = await getUsersBatch({ afterId: 'u5', limit: 25, tenantId: 'tenant-a' });

      expect(h.withTenantContext).toHaveBeenCalledTimes(1);
      expect(h.withTenantContext).toHaveBeenCalledWith(
        { role: 'system', tenantId: 'tenant-a' },
        expect.any(Function)
      );
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

      await getUsersBatch({ afterId: null, tenantId: 'tenant-b' });

      const options = h.findManyUsers.mock.calls[0][0] as { limit: number; where: unknown };
      const where = evaluateWhere(options.where, 'user');
      expect(findClause(where, 'eq', 'user.tenantId')).toEqual({ right: 'tenant-b' });
      expect(findClause(where, 'gt', 'user.id')).toBeUndefined();
      expect(options.limit).toBe(500);
    });
  });

  describe('processBatchedUserCampaign', () => {
    it('iterates tenants one at a time with an independent cursor per tenant', async () => {
      h.listTenantIdsForScheduledWork.mockResolvedValue(['tenant-a', 'tenant-b']);
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
        campaignId: 'campaign-1',
        sendToUser: async u => {
          sent.push(`${u.tenantId}:${u.id}`);
        },
      });

      expect(h.listTenantIdsForScheduledWork).toHaveBeenCalledTimes(1);
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
      const firstTenantB = h.events.indexOf('ctx:tenant-b:system');
      expect(h.events.slice(0, firstTenantB).every(event => event === 'ctx:tenant-a:system')).toBe(
        true
      );
      expect(new Set(h.events)).toEqual(new Set(['ctx:tenant-a:system', 'ctx:tenant-b:system']));
    });

    it('does nothing when there are no tenants', async () => {
      h.listTenantIdsForScheduledWork.mockResolvedValue([]);

      const result = await processBatchedUserCampaign({
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
      h.listTenantIdsForScheduledWork.mockResolvedValue(['tenant-a', 'tenant-b']);
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
      expect(sent).toEqual(['tenant-a:a1', 'tenant-b:b1', 'tenant-b:b2']);
      expect(context.stats.sent).toBe(3);
      expect(context.errors).toEqual([]);
    });
  });
});
