import type { IngressCapability } from '@interdomestik/database/ingress';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  list: vi.fn(),
  page: vi.fn(),
  member: vi.fn(),
  outlook: vi.fn(),
  reminder: vi.fn(),
  final: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
  audit: vi.fn(),
  tenant: vi.fn(),
  skipped: vi.fn(),
  insert: vi.fn(),
}));
vi.mock('@interdomestik/database', async original => ({
  ...(await original<typeof import('@interdomestik/database')>()),
  listScheduledTenantWork: h.list,
  withTenantContext: h.tenant,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', () => ({
  readSponsorOutlook: h.outlook,
}));
vi.mock('@/lib/email', () => ({
  sendPaymentReminderEmail: h.reminder,
  sendPaymentFinalWarningEmail: h.final,
}));
vi.mock('@/lib/audit', () => ({ logAuditEvent: h.audit }));
import { runDunningCronCore } from './_core';

const authority = mintTestTenantAuthority('tenant-1');
const ingress = {} as IngressCapability<'cron'>;
const now = new Date('2026-11-08T12:00:00Z');
const periodEnd = new Date('2026-11-20T12:00:00Z');
const tx = {
  query: {
    subscriptions: { findMany: h.page },
    user: { findFirst: h.member },
    engagementEmailSends: { findFirst: h.skipped },
  },
  update: h.update,
  insert: () => ({ values: h.insert }),
};

function subscription(day: 7 | 13) {
  return {
    id: 'sub-1',
    tenantId: 'tenant-1',
    userId: 'member-1',
    planId: 'individual-plan',
    currentPeriodEnd: periodEnd,
    pastDueAt: new Date(now.getTime() - day * 86400000),
    gracePeriodEndsAt: new Date(now.getTime() + (14 - day) * 86400000),
  };
}

describe('dunning sponsor outlook at delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    h.list.mockResolvedValue([{ tenantId: 'tenant-1', authority }]);
    h.tenant.mockImplementation(
      (_authority: unknown, action: (value: typeof tx) => Promise<unknown>) => action(tx)
    );
    h.member.mockResolvedValue({ id: 'member-1', email: 'member@example.test', name: 'Member' });
    h.page.mockResolvedValue([]);
    h.skipped.mockResolvedValue(null);
    h.insert.mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
    h.update.mockReturnValue({ set: () => ({ where: h.where }) });
    h.outlook.mockResolvedValue(new Map());
  });

  afterEach(() => vi.useRealTimers());

  const cases = ([7, 13] as const).flatMap(day => [
    {
      day,
      label: 'covering now',
      outlook: { covering: { source: 'sponsor' }, nextStart: null },
      expected: true,
    },
    {
      day,
      label: 'starts before end',
      outlook: { covering: null, nextStart: new Date('2026-11-19T12:00:00Z') },
      expected: true,
    },
    {
      day,
      label: 'starts at end',
      outlook: { covering: null, nextStart: periodEnd },
      expected: true,
    },
    {
      day,
      label: 'starts after end',
      outlook: { covering: null, nextStart: new Date('2026-11-20T12:00:00.001Z') },
      expected: false,
    },
    {
      day,
      label: 'no sponsorship',
      outlook: { covering: null, nextStart: null },
      expected: false,
    },
  ]);
  it.each(cases)('day $day: $label', async ({ day, outlook, expected }) => {
    h.page.mockResolvedValueOnce([subscription(day)]).mockResolvedValueOnce([]);
    h.outlook.mockResolvedValueOnce(new Map([['member-1', outlook]]));
    const result = await runDunningCronCore({ ingress, now, headers: new Headers() });
    expect(result.stats).toMatchObject({ checked: 1, errors: 0 });
    const send = day === 7 ? h.reminder : h.final;
    expect(send).toHaveBeenLastCalledWith(
      'member@example.test',
      expect.objectContaining({
        accessContinues: expected,
        memberName: 'Member',
        planName: 'individual-plan',
        daysRemaining: 14 - day,
      })
    );
    expect(h.outlook).toHaveBeenLastCalledWith(tx, 'tenant-1', ['member-1'], now);
    expect(h.tenant.mock.calls.every(([value]) => value === authority)).toBe(true);
    expect(h.outlook.mock.invocationCallOrder.at(-1)).toBeLessThan(
      send.mock.invocationCallOrder.at(-1) ?? 0
    );
  });

  it('uses delivery time if the run crosses a coverage boundary', async () => {
    const deliveryTime = new Date(now.getTime() + 60000);
    h.page.mockResolvedValueOnce([subscription(7)]);
    h.member.mockImplementationOnce(async () => {
      vi.setSystemTime(deliveryTime);
      return { email: 'member@example.test', name: 'Member' };
    });
    await runDunningCronCore({ ingress, now, headers: new Headers() });
    expect(h.outlook).toHaveBeenCalledWith(tx, 'tenant-1', ['member-1'], deliveryTime);
  });

  it('does not send or acknowledge when coverage cannot be read', async () => {
    h.page.mockResolvedValueOnce([subscription(7)]);
    h.outlook.mockRejectedValueOnce(new Error('coverage unavailable'));
    const result = await runDunningCronCore({ ingress, now, headers: new Headers() });
    expect(result.stats.errors).toBe(1);
    expect(h.reminder).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('does not read coverage or deliver without a recipient', async () => {
    h.page.mockResolvedValueOnce([subscription(7)]);
    h.member.mockResolvedValueOnce(null);
    await runDunningCronCore({ ingress, now, headers: new Headers() });
    expect(h.outlook).not.toHaveBeenCalled();
    expect(h.reminder).not.toHaveBeenCalled();
  });
  it('does not count or acknowledge a suppressed reminder as sent', async () => {
    h.page.mockResolvedValueOnce([subscription(7)]);
    h.reminder.mockResolvedValue({ success: false, suppressed: true, error: 'email_suppressed' });
    const result = await runDunningCronCore({ ingress, now, headers: new Headers() });
    expect(result.stats).toMatchObject({ day7Sent: 0, errors: 0 });
    expect(h.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'skipped', sentAt: null, providerMessageId: null })
    );
    expect(h.audit).not.toHaveBeenCalled();
    h.skipped.mockResolvedValue({ id: 'skip-1' });
    h.page.mockResolvedValueOnce([subscription(7)]);
    await runDunningCronCore({ ingress, now, headers: new Headers() });
    expect(h.reminder).toHaveBeenCalledTimes(1);
    expect(h.update).not.toHaveBeenCalled();
  });
});
