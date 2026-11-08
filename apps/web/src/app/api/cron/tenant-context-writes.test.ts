import type { IngressCapability } from '@interdomestik/database/ingress';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const member = {
  email: 'member@example.com',
  name: 'Member One',
  subId: 'sub-1',
  tenantId: 'tenant-1',
  userId: 'user-1',
};

// The producer is mocked; this stands in for the cron route's admitted capability.
const INGRESS = Object.freeze({}) as IngressCapability<'cron'>;

const hoisted = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  gte: vi.fn((left: unknown, right: unknown) => ({ op: 'gte', left, right })),
  insert: {
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    values: vi.fn().mockReturnThis(),
  },
  ambientSelect: vi.fn(),
  listScheduledTenantWork: vi.fn(),
  logAuditEvent: vi.fn(),
  lte: vi.fn((left: unknown, right: unknown) => ({ op: 'lte', left, right })),
  select: {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    where: vi.fn().mockReturnThis(),
  },
  sendNpsSurveyEmail: vi.fn(),
  sendOnboardingEmail: vi.fn(),
  table: new Proxy({}, { get: (_target, prop) => String(prop) }),
  txInsert: vi.fn(),
  txSelect: {
    from: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    where: vi.fn().mockReturnThis(),
  },
  txSet: vi.fn(),
  txUpdate: vi.fn(),
  txWhere: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: hoisted.logAuditEvent,
}));

vi.mock('@/lib/email', () => ({
  sendCheckinEmail: vi.fn(),
  sendEngagementDay30Email: vi.fn(),
  sendEngagementDay60Email: vi.fn(),
  sendEngagementDay90Email: vi.fn(),
  sendNpsSurveyEmail: hoisted.sendNpsSurveyEmail,
  sendOnboardingEmail: hoisted.sendOnboardingEmail,
  sendSeasonalEmail: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: { select: hoisted.ambientSelect },
  withTenantContext: hoisted.withTenantContext,
  listScheduledTenantWork: hoisted.listScheduledTenantWork,
}));

vi.mock('@interdomestik/database/schema', () => ({
  engagementEmailSends: hoisted.table,
  npsSurveyTokens: hoisted.table,
  subscriptions: hoisted.table,
  user: hoisted.table,
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
  gte: hoisted.gte,
  inArray: vi.fn((left: unknown, right: unknown) => ({ op: 'inArray', left, right })),
  lte: hoisted.lte,
}));

// Selection reads the coverage set first (ACQ-3b §3.6.3); the member is sponsor-covered here.
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', () => ({
  effectiveCoverageMembers: vi.fn(async () => [
    { userId: member.userId, membership: { source: 'sponsor' } },
  ]),
}));

vi.mock('@interdomestik/domain-membership-billing', () => ({
  getMembershipLifecycleBucket: vi.fn(),
  membershipLifecycleGrantsAccess: vi.fn(() => false),
}));

vi.mock('nanoid', () => ({ nanoid: (size?: number) => (size ? 'survey-token' : 'id-1') }));

function setupTenantContextHarness() {
  vi.clearAllMocks();
  hoisted.ambientSelect.mockImplementation(() => hoisted.select);
  hoisted.select.from.mockReturnThis();
  hoisted.select.innerJoin.mockReturnThis();
  hoisted.select.where.mockReturnThis();
  hoisted.select.limit.mockResolvedValue([]);
  hoisted.txSelect.from.mockReturnThis();
  hoisted.txSelect.where.mockReturnThis();
  hoisted.txSelect.limit.mockResolvedValue([{ token: 'survey-token' }]);
  hoisted.insert.values.mockReturnThis();
  hoisted.insert.onConflictDoNothing.mockReturnThis();
  hoisted.insert.returning.mockResolvedValue([{ id: 'send-1' }]);
  hoisted.txInsert.mockReturnValue(hoisted.insert);
  hoisted.txUpdate.mockReturnValue({ set: hoisted.txSet });
  hoisted.txSet.mockReturnValue({ where: hoisted.txWhere });
  hoisted.txWhere.mockResolvedValue(undefined);
  hoisted.withTenantContext.mockImplementation(
    async (_context: unknown, action: (tx: unknown) => Promise<unknown>) =>
      await action({
        insert: hoisted.txInsert,
        // The member enumeration selects `subId`; the NPS token lookup selects only `token`.
        select: vi.fn((fields: Record<string, unknown>) =>
          'subId' in fields ? hoisted.select : hoisted.txSelect
        ),
        update: hoisted.txUpdate,
      })
  );
  hoisted.sendNpsSurveyEmail.mockResolvedValue({ success: true, id: 'message-1' });
  hoisted.sendOnboardingEmail.mockResolvedValue({ success: true, id: 'message-1' });
}

// vi.resetModules() gives the re-imported code a fresh authority registry, so the token the scheduled
// producer hands out must be minted from the same post-reset module graph.
async function scheduleMemberTenant() {
  const { mintTestTenantAuthority } =
    await import('@interdomestik/database/testing/tenant-authority');
  const authority = mintTestTenantAuthority(member.tenantId);
  hoisted.listScheduledTenantWork.mockResolvedValue([{ tenantId: member.tenantId, authority }]);
  return authority;
}

function expectEveryTenantContextRanUnder(authority: unknown) {
  expect(hoisted.withTenantContext).toHaveBeenCalled();
  for (const [context] of hoisted.withTenantContext.mock.calls) expect(context).toBe(authority);
}

describe('cron tenant-context writes', () => {
  beforeEach(() => {
    setupTenantContextHarness();
  });

  it('writes lifecycle engagement sends through the subscription tenant context', async () => {
    vi.resetModules();
    const memberAuthority = await scheduleMemberTenant();
    hoisted.select.limit.mockResolvedValueOnce([member]).mockResolvedValue([]);
    const { runEngagementCronCore } =
      await vi.importActual<typeof import('./engagement/_core')>('./engagement/_core');

    const results = await runEngagementCronCore({
      ingress: INGRESS,
      headers: new Headers(),
      now: new Date('2026-01-15T00:00:00.000Z'),
    });

    expect(results.day7).toBe(1);
    expectEveryTenantContextRanUnder(memberAuthority);
    expect(hoisted.logAuditEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.logAuditEvent.mock.calls[0]?.[0].authority).toBe(memberAuthority);
    expect(hoisted.logAuditEvent.mock.calls[0]?.[0]).not.toHaveProperty('tenantId');
    expect(hoisted.ambientSelect).not.toHaveBeenCalled();
    expect(hoisted.eq).toHaveBeenCalledWith('tenantId', member.tenantId);
    expect(hoisted.select.limit).toHaveBeenCalledWith(200);
    expect(hoisted.txInsert).toHaveBeenCalledWith(expect.anything());
    expect(hoisted.txUpdate).toHaveBeenCalledWith(expect.anything());
    expect(hoisted.insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: 'engagement:sub-1:onboarding',
        tenantId: member.tenantId,
        userId: member.userId,
      })
    );
  });

  it('writes NPS send and token rows through the subscription tenant context', async () => {
    vi.resetModules();
    const memberAuthority = await scheduleMemberTenant();
    hoisted.select.limit.mockResolvedValueOnce([member]);
    const { runNpsCronCore } = await vi.importActual<typeof import('./nps/_core')>('./nps/_core');

    const results = await runNpsCronCore({
      ingress: INGRESS,
      headers: new Headers(),
      now: new Date('2026-01-15T00:00:00.000Z'),
    });

    expect(results.sent).toBe(1);
    expect(hoisted.ambientSelect).not.toHaveBeenCalled();
    expect(hoisted.eq).toHaveBeenCalledWith('tenantId', member.tenantId);
    expect(hoisted.select.limit).toHaveBeenCalledWith(200);
    expectEveryTenantContextRanUnder(memberAuthority);
    expect(hoisted.logAuditEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.logAuditEvent.mock.calls[0]?.[0].authority).toBe(memberAuthority);
    expect(hoisted.txInsert).toHaveBeenCalledWith(expect.anything());
    expect(hoisted.txUpdate).toHaveBeenCalledWith(expect.anything());
    expect(hoisted.insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: 'engagement:sub-1:nps_v1',
        tenantId: member.tenantId,
        userId: member.userId,
      })
    );
  });
});
