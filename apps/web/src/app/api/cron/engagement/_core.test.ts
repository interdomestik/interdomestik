import type { IngressCapability } from '@interdomestik/database/ingress';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const INGRESS = Object.freeze({}) as IngressCapability<'cron'>;
const authorityA = mintTestTenantAuthority('tenant-a');
const authorityB = mintTestTenantAuthority('tenant-b');

const memberOf = (tenantId: string | null, subId: string) => ({
  email: `${subId}@example.com`,
  name: `Member ${subId}` as string | null,
  subId,
  tenantId,
  userId: `user-${subId}`,
});

type Write = { authority: unknown; kind: 'insert' | 'update'; values: Record<string, unknown> };

const hoisted = vi.hoisted(() => ({
  currentAuthority: { value: undefined as unknown },
  listScheduledTenantWork: vi.fn(),
  logAuditEvent: vi.fn(),
  selectActiveSubscriptionMembers: vi.fn(),
  sendOnboardingEmail: vi.fn(),
  sendSeasonalEmail: vi.fn(),
  withTenantContext: vi.fn(),
  writes: [] as unknown[],
}));

vi.mock('@/lib/audit', () => ({ logAuditEvent: hoisted.logAuditEvent }));
vi.mock('@/lib/email', () => ({
  sendCheckinEmail: vi.fn(),
  sendEngagementDay30Email: vi.fn(),
  sendEngagementDay60Email: vi.fn(),
  sendEngagementDay90Email: vi.fn(),
  sendOnboardingEmail: hoisted.sendOnboardingEmail,
  sendSeasonalEmail: hoisted.sendSeasonalEmail,
}));
vi.mock('@interdomestik/database', () => ({
  listScheduledTenantWork: hoisted.listScheduledTenantWork,
  withTenantContext: hoisted.withTenantContext,
}));
vi.mock('@interdomestik/database/schema', () => ({ engagementEmailSends: {} }));
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn() }));
vi.mock('nanoid', () => ({ nanoid: () => 'id-1' }));
vi.mock('../_scheduled-members', () => ({
  selectActiveSubscriptionMembers: hoisted.selectActiveSubscriptionMembers,
}));

import { runEngagementCronCore } from './_core';

const writes = () => hoisted.writes as Write[];

describe('runEngagementCronCore tenant authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.writes.length = 0;
    hoisted.listScheduledTenantWork.mockImplementation(async (ingress: unknown) => {
      if (ingress !== INGRESS) throw new Error('Ingress capability required');
      return [
        { tenantId: 'tenant-a', authority: authorityA },
        { tenantId: 'tenant-b', authority: authorityB },
      ];
    });
    hoisted.withTenantContext.mockImplementation(
      async (authority: unknown, action: (tx: unknown) => Promise<unknown>) =>
        action({
          insert: () => ({
            values: (values: Record<string, unknown>) => {
              hoisted.writes.push({ authority, kind: 'insert', values });
              return { onConflictDoNothing: () => ({ returning: async () => [{ id: 'send-1' }] }) };
            },
          }),
          update: () => ({
            set: (values: Record<string, unknown>) => {
              hoisted.writes.push({ authority, kind: 'update', values });
              return { where: async () => undefined };
            },
          }),
        })
    );
    hoisted.sendOnboardingEmail.mockResolvedValue({ success: true, id: 'message-1' });
    hoisted.sendSeasonalEmail.mockResolvedValue({ success: true, id: 'message-1' });
    hoisted.logAuditEvent.mockResolvedValue(undefined);
  });

  const run = (ingress = INGRESS, now = new Date('2026-01-15T00:00:00.000Z')) =>
    runEngagementCronCore({ ingress, now, headers: new Headers() });

  function membersOnFirstCadence(members: ReturnType<typeof memberOf>[]) {
    hoisted.selectActiveSubscriptionMembers.mockResolvedValueOnce(members).mockResolvedValue([]);
  }

  it('hands each tenant its own scheduled authority for every per-member write and audit', async () => {
    membersOnFirstCadence([memberOf('tenant-a', 'sub-a'), memberOf('tenant-b', 'sub-b')]);

    const results = await run();

    expect(results.day7).toBe(2);
    expect(hoisted.listScheduledTenantWork).toHaveBeenCalledWith(INGRESS);
    // Inserts carry their tenant id; the authority that performed the insert must be that tenant's.
    for (const write of writes().filter(entry => entry.kind === 'insert')) {
      expect(write.authority).toBe(write.values.tenantId === 'tenant-a' ? authorityA : authorityB);
    }
    // Updates are ordered per member: pending insert (a), sent update (a), insert (b), update (b).
    expect(writes().map(write => write.authority)).toEqual([
      authorityA,
      authorityA,
      authorityB,
      authorityB,
    ]);
    expect(hoisted.logAuditEvent.mock.calls.map(([event]) => event.authority)).toEqual([
      authorityA,
      authorityB,
    ]);
    for (const [event] of hoisted.logAuditEvent.mock.calls) {
      expect(event).not.toHaveProperty('tenantId');
    }
  });

  it('skips a member whose tenant was not scheduled and writes nothing for it', async () => {
    membersOnFirstCadence([memberOf('tenant-unlisted', 'sub-x'), memberOf(null, 'sub-y')]);

    const results = await run();

    expect(results.skipped).toBe(2);
    expect(results.day7).toBe(0);
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.sendOnboardingEmail).not.toHaveBeenCalled();
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
  });

  it('marks a send without recipient details as skipped under the tenant authority', async () => {
    membersOnFirstCadence([{ ...memberOf('tenant-b', 'sub-b'), name: null }]);

    const results = await run();

    expect(results.skipped).toBe(1);
    expect(writes().map(write => [write.kind, write.authority])).toEqual([
      ['insert', authorityB],
      ['update', authorityB],
    ]);
    expect(writes()[1]?.values).toMatchObject({
      status: 'skipped',
      error: 'Missing recipient email or name',
    });
    expect(hoisted.sendOnboardingEmail).not.toHaveBeenCalled();
  });

  it('records a failed send under the tenant authority', async () => {
    hoisted.sendOnboardingEmail.mockResolvedValue({ success: false, error: 'boom' });
    membersOnFirstCadence([memberOf('tenant-a', 'sub-a')]);

    const results = await run();

    expect(results.errors).toBe(1);
    expect(writes().map(write => write.authority)).toEqual([authorityA, authorityA]);
    expect(writes()[1]?.values).toMatchObject({ status: 'error', error: 'boom' });
    expect(hoisted.logAuditEvent.mock.calls[0]?.[0]).toMatchObject({
      action: 'email.engagement.failed',
    });
    expect(hoisted.logAuditEvent.mock.calls[0]?.[0].authority).toBe(authorityA);
  });

  it('does nothing for a request that was not admitted', async () => {
    const notAdmitted = Object.freeze({}) as IngressCapability<'cron'>;

    await expect(run(notAdmitted)).rejects.toThrow('Ingress capability required');

    expect(hoisted.selectActiveSubscriptionMembers).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.sendOnboardingEmail).not.toHaveBeenCalled();
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
  });

  it('uses the same scheduled authority for seasonal sends', async () => {
    // Lifecycle cadences select within a creation window; the seasonal run selects without one.
    hoisted.selectActiveSubscriptionMembers.mockImplementation(
      async (args: { createdBetween?: unknown }) =>
        args.createdBetween ? [] : [memberOf('tenant-b', 'sub-b')]
    );

    const results = await run(INGRESS, new Date(2026, 10, 1, 12));

    expect(results.seasonal).toBe(1);
    expect(hoisted.sendSeasonalEmail).toHaveBeenCalledTimes(1);
    expect(writes().map(write => write.authority)).toEqual([authorityB, authorityB]);
    expect(hoisted.logAuditEvent.mock.calls[0]?.[0].authority).toBe(authorityB);
  });
});
