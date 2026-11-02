import { beforeEach, describe, expect, it, vi } from 'vitest';

import { evaluateWhere, findClause, pageRowsByTenant } from './tenant-campaign-test-support';

type TenantContext = { tenantId: string; role: string };
type FakeSubscription = {
  id: string;
  tenantId: string;
  user: { email: string | null; name: string | null; tenantId: string };
  userId: string;
};

const h = vi.hoisted(() => ({
  findManyLogs: vi.fn(),
  findManySubscriptions: vi.fn(),
  findManyUsers: vi.fn(),
  insertValues: vi.fn(),
  listTenantIdsForScheduledWork: vi.fn<() => Promise<string[]>>(),
  sendCheckinEmail: vi.fn(),
  sendOnboardingEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  inArray: (left: unknown, right: unknown[]) => ({ left, op: 'inArray', right }),
  withTenantContext: h.withTenantContext,
}));
vi.mock('@interdomestik/database/scheduled-tenant-work', () => ({
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
vi.mock('./email', () => ({
  sendAnnualReportEmail: vi.fn(),
  sendCheckinEmail: h.sendCheckinEmail,
  sendOnboardingEmail: h.sendOnboardingEmail,
  sendSeasonalEmail: vi.fn(),
  sendWelcomeEmail: h.sendWelcomeEmail,
}));
vi.mock('./notifications/notify', () => ({ sendNotification: vi.fn() }));

import { processEmailSequences } from './cron-service';

function subscription(id: string, tenantId: string): FakeSubscription {
  return {
    id,
    tenantId,
    user: { email: `${id}@example.com`, name: `Member ${id}`, tenantId },
    userId: `user-${id}`,
  };
}

describe('processEmailSequences welcome campaign', () => {
  const welcomeEvents: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    welcomeEvents.length = 0;
    h.findManyLogs.mockResolvedValue([]);
    h.findManyUsers.mockResolvedValue([]);
    h.insertValues.mockResolvedValue(undefined);
    h.sendWelcomeEmail.mockResolvedValue(undefined);
    h.withTenantContext.mockImplementation(
      async (context: TenantContext, action: (tx: unknown) => Promise<unknown>) =>
        action({
          insert: () => ({ values: h.insertValues }),
          query: {
            emailCampaignLogs: { findMany: h.findManyLogs },
            subscriptions: {
              findMany: (options: unknown) => {
                welcomeEvents.push(`ctx:${context.tenantId}:${context.role}`);
                return h.findManySubscriptions(options);
              },
            },
            user: { findMany: h.findManyUsers },
          },
        })
    );
  });

  it('fetches subscriptions once per tenant, inside that tenant context, with independent cursors', async () => {
    h.listTenantIdsForScheduledWork.mockResolvedValue(['tenant-a', 'tenant-b']);
    const rowsByTenant = {
      'tenant-a': [subscription('a1', 'tenant-a'), subscription('a2', 'tenant-a')],
      'tenant-b': [subscription('b1', 'tenant-b')],
    };
    const pages: Array<[string, string | null]> = [];
    h.findManySubscriptions.mockImplementation(
      async (options: { where: unknown; with: unknown; limit: number }) => {
        const clause = evaluateWhere(options.where, 'subscriptions');
        expect(findClause(clause, 'eq', 'subscriptions.status')).toEqual({ right: 'active' });
        expect(options.with).toEqual({ user: true });
        expect(options.limit).toBe(500);
        const page = pageRowsByTenant(rowsByTenant, options.where, 'subscriptions', 1);
        pages.push([page.tenantId, page.afterId]);
        return page.rows;
      }
    );

    const result = await processEmailSequences();

    expect(pages).toEqual([
      ['tenant-a', null],
      ['tenant-a', 'a1'],
      ['tenant-a', 'a2'],
      ['tenant-b', null],
      ['tenant-b', 'b1'],
    ]);
    expect(welcomeEvents).toEqual([
      'ctx:tenant-a:system',
      'ctx:tenant-a:system',
      'ctx:tenant-a:system',
      'ctx:tenant-b:system',
      'ctx:tenant-b:system',
    ]);
    expect(h.sendWelcomeEmail.mock.calls.map(call => call[0])).toEqual([
      'a1@example.com',
      'a2@example.com',
      'b1@example.com',
    ]);
    expect(result.errors).toEqual([]);
  });

  it('does not query subscriptions when there are no tenants', async () => {
    h.listTenantIdsForScheduledWork.mockResolvedValue([]);

    const result = await processEmailSequences();

    expect(h.withTenantContext).not.toHaveBeenCalled();
    expect(h.findManySubscriptions).not.toHaveBeenCalled();
    expect(result.stats.attempted).toBe(0);
  });
});
