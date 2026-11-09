import type { IngressCapability } from '@interdomestik/database/ingress';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateWhere,
  findClause,
  pageRowsByTenant,
  recordingOperators,
} from './tenant-campaign-test-support';

// The producer is mocked; this stands in for the cron or Inngest entry's admitted capability.
Object.assign(recordingOperators, {
  isNull: (left: unknown) => ({ op: 'isNull', left }),
  ne: (left: unknown, right: unknown) => ({ op: 'ne', left, right }),
  or: (...clauses: unknown[]) => ({ op: 'or', clauses }),
});

const INGRESS = Object.freeze({}) as IngressCapability<'inngest'>;
const authorities: Record<string, TenantAuthority> = {};

function scheduleTenants(tenantIds: string[]) {
  for (const tenantId of tenantIds) authorities[tenantId] = mintTestTenantAuthority(tenantId);
  h.listScheduledTenantWork.mockResolvedValue(
    tenantIds.map(tenantId => ({ tenantId, authority: authorities[tenantId] }))
  );
}
type FakeSubscription = {
  id: string;
  tenantId: string;
  user: { email: string | null; name: string | null; tenantId: string };
  userId: string;
};

const h = vi.hoisted(() => ({
  findManyLogs: vi.fn(),
  findManySkipped: vi.fn().mockResolvedValue([]),
  findManySubscriptions: vi.fn(),
  findManyUsers: vi.fn(),
  insertValues: vi.fn(),
  listScheduledTenantWork: vi.fn(),
  sendCheckinEmail: vi.fn(),
  sendOnboardingEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  inArray: (left: unknown, right: unknown[]) => ({ left, op: 'inArray', right }),
  withTenantContext: h.withTenantContext,
  listScheduledTenantWork: h.listScheduledTenantWork,
}));

vi.mock('@interdomestik/database/schema', () => ({
  engagementEmailSends: {
    tenantId: 'engagementEmailSends.tenantId',
    userId: 'engagementEmailSends.userId',
    templateKey: 'engagementEmailSends.templateKey',
    status: 'engagementEmailSends.status',
    dedupeKey: 'engagementEmailSends.dedupeKey',
  },
  emailCampaignLogs: {
    campaignId: 'emailCampaignLogs.campaignId',
    tenantId: 'emailCampaignLogs.tenantId',
    userId: 'emailCampaignLogs.userId',
  },
}));
vi.mock('drizzle-orm', () => ({
  inArray: (left: unknown, right: unknown[]) => ({ left, op: 'inArray', right }),
  and: (...clauses: unknown[]) => ({ clauses, op: 'and' }),
  eq: (left: unknown, right: unknown) => ({ left, op: 'eq', right }),
}));
vi.mock('nanoid', () => ({ nanoid: () => 'id-1' }));
vi.mock('./email', () => ({
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
  const welcomeAuthorities: TenantAuthority[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    welcomeEvents.length = 0;
    welcomeAuthorities.length = 0;
    h.findManyLogs.mockResolvedValue([]);
    h.findManySkipped.mockResolvedValue([]);
    h.findManyUsers.mockResolvedValue([]);
    h.insertValues.mockResolvedValue(undefined);
    h.sendWelcomeEmail.mockResolvedValue({ success: true, id: 'email-1' });
    h.withTenantContext.mockImplementation(
      async (context: TenantAuthority, action: (tx: unknown) => Promise<unknown>) =>
        action({
          insert: () => ({ values: h.insertValues }),
          query: {
            emailCampaignLogs: { findMany: h.findManyLogs },
            engagementEmailSends: { findMany: h.findManySkipped },
            subscriptions: {
              findMany: (options: unknown) => {
                welcomeEvents.push(`ctx:${readTenantAuthority(context).tenantId}`);
                welcomeAuthorities.push(context);
                return h.findManySubscriptions(options);
              },
            },
            user: { findMany: h.findManyUsers },
          },
        })
    );
  });

  it('fetches subscriptions once per tenant, inside that tenant context, with independent cursors', async () => {
    scheduleTenants(['tenant-a', 'tenant-b']);
    const rowsByTenant = {
      'tenant-a': [subscription('a1', 'tenant-a'), subscription('a2', 'tenant-a')],
      'tenant-b': [subscription('b1', 'tenant-b')],
    };
    const pages: Array<[string, string | null]> = [];
    h.findManySubscriptions.mockImplementation(
      async (options: { where: unknown; with: unknown; limit: number }) => {
        const clause = evaluateWhere(options.where, 'subscriptions');
        expect(findClause(clause, 'eq', 'subscriptions.status')).toEqual({ right: 'active' });
        expect(clause.clauses).toContainEqual({
          op: 'or',
          clauses: [
            { op: 'isNull', left: 'subscriptions.provider' },
            { op: 'ne', left: 'subscriptions.provider', right: 'group_sponsor' },
          ],
        });
        expect(options.with).toEqual({ user: true });
        expect(options.limit).toBe(500);
        const page = pageRowsByTenant(rowsByTenant, options.where, 'subscriptions', 1);
        pages.push([page.tenantId, page.afterId]);
        return page.rows;
      }
    );

    const result = await processEmailSequences(INGRESS);

    expect(pages).toEqual([
      ['tenant-a', null],
      ['tenant-a', 'a1'],
      ['tenant-a', 'a2'],
      ['tenant-b', null],
      ['tenant-b', 'b1'],
    ]);
    expect(welcomeEvents).toEqual([
      'ctx:tenant-a',
      'ctx:tenant-a',
      'ctx:tenant-a',
      'ctx:tenant-b',
      'ctx:tenant-b',
    ]);
    // Each subscription fetch ran under the exact token the producer minted for that tenant.
    expect(welcomeAuthorities).toHaveLength(5);
    for (const authority of welcomeAuthorities) {
      expect(authority).toBe(authorities[readTenantAuthority(authority).tenantId]);
    }
    // Welcome, onboarding and check-in each ask the producer, always with the entry's capability.
    expect(h.listScheduledTenantWork).toHaveBeenCalledTimes(3);
    for (const call of h.listScheduledTenantWork.mock.calls) expect(call[0]).toBe(INGRESS);
    expect(h.sendWelcomeEmail.mock.calls.map(call => call[0])).toEqual([
      'a1@example.com',
      'a2@example.com',
      'b1@example.com',
    ]);
    expect(result.errors).toEqual([]);
  });

  it('excludes sponsored rows with or without coverage while retaining Paddle and legacy rows', async () => {
    scheduleTenants(['tenant-a']);
    const rows = [
      { ...subscription('sponsor-covered', 'tenant-a'), provider: 'group_sponsor' },
      { ...subscription('sponsor-uncovered', 'tenant-a'), provider: 'group_sponsor' },
      { ...subscription('paddle', 'tenant-a'), provider: 'paddle' },
      { ...subscription('legacy', 'tenant-a'), provider: null },
    ];
    h.findManySubscriptions.mockImplementation(async (options: { where: unknown }) => {
      const clause = evaluateWhere(options.where, 'subscriptions');
      if (findClause(clause, 'gt', 'subscriptions.id')) return [];
      const providerClause = clause.clauses?.find(part => part.op === 'or');
      if (!providerClause) throw new Error('Missing provider exclusion');
      return rows.filter(row =>
        providerClause.clauses?.some(
          part =>
            part.left === 'subscriptions.provider' &&
            (part.op === 'isNull'
              ? row.provider === null
              : row.provider !== null && row.provider !== part.right)
        )
      );
    });
    const result = await processEmailSequences(INGRESS);
    expect(result.errors).toEqual([]);
    expect(h.sendWelcomeEmail.mock.calls.map(call => call[0])).toEqual([
      'paddle@example.com',
      'legacy@example.com',
    ]);
  });

  it('does not query subscriptions when there are no tenants', async () => {
    scheduleTenants([]);

    const result = await processEmailSequences(INGRESS);

    expect(h.withTenantContext).not.toHaveBeenCalled();
    expect(h.findManySubscriptions).not.toHaveBeenCalled();
    expect(result.stats.attempted).toBe(0);
  });
  it('never writes a campaign delivery receipt for a suppressed email', async () => {
    scheduleTenants(['tenant-a']);
    h.findManySubscriptions
      .mockResolvedValueOnce([subscription('a1', 'tenant-a')])
      .mockResolvedValue([]);
    h.insertValues.mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
    h.sendWelcomeEmail.mockResolvedValue({
      success: false,
      suppressed: true,
      error: 'email_suppressed',
    });
    const result = await processEmailSequences(INGRESS);
    expect(result.stats.sent).toBe(0);
    expect(result.stats.failed).toBe(0);
    expect(result.stats.skipped).toBe(1);
    expect(result.errors).toEqual([]);
    expect(h.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'skipped', sentAt: null, providerMessageId: null })
    );
    h.findManySkipped.mockResolvedValue([{ tenantId: 'tenant-a', userId: 'user-a1' }]);
    h.findManySubscriptions.mockResolvedValueOnce([subscription('a1', 'tenant-a')]);
    await processEmailSequences(INGRESS);
    expect(h.sendWelcomeEmail).toHaveBeenCalledTimes(1);
  });
});
