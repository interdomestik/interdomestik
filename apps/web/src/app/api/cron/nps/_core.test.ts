import type { IngressCapability } from '@interdomestik/database/ingress';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const INGRESS = Object.freeze({}) as IngressCapability<'cron'>;
const authorityA = mintTestTenantAuthority('tenant-a');
const authorityB = mintTestTenantAuthority('tenant-b');

const memberOf = (tenantId: string | null, subId: string) => ({
  email: `${subId}@example.com`,
  name: `Member ${subId}`,
  subId,
  tenantId,
  userId: `user-${subId}`,
});

type Write = { authority: unknown; kind: string; values: Record<string, unknown> };

const hoisted = vi.hoisted(() => ({
  listScheduledTenantWork: vi.fn(),
  logAuditEvent: vi.fn(),
  selectActiveSubscriptionMembers: vi.fn(),
  sendNpsSurveyEmail: vi.fn(),
  withTenantContext: vi.fn(),
  writes: [] as unknown[],
  dedupeKeys: new Set<string>(),
}));

vi.mock('@/lib/audit', () => ({ logAuditEvent: hoisted.logAuditEvent }));
vi.mock('@/lib/email', () => ({ sendNpsSurveyEmail: hoisted.sendNpsSurveyEmail }));
vi.mock('@interdomestik/database', () => ({
  listScheduledTenantWork: hoisted.listScheduledTenantWork,
  withTenantContext: hoisted.withTenantContext,
}));
vi.mock('@interdomestik/database/schema', () => ({
  engagementEmailSends: {},
  npsSurveyTokens: {},
}));
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn() }));
vi.mock('nanoid', () => ({ nanoid: (size?: number) => (size ? 'survey-token' : 'id-1') }));
vi.mock('../_scheduled-members', () => ({
  selectActiveSubscriptionMembers: hoisted.selectActiveSubscriptionMembers,
}));

import { runNpsCronCore } from './_core';

const writes = () => hoisted.writes as Write[];

describe('runNpsCronCore tenant authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.writes.length = 0;
    hoisted.dedupeKeys.clear();
    hoisted.listScheduledTenantWork.mockImplementation(async (ingress: unknown) => {
      if (ingress !== INGRESS) throw new Error('Ingress capability required');
      return [
        { tenantId: 'tenant-a', authority: authorityA },
        { tenantId: 'tenant-b', authority: authorityB },
      ];
    });
    hoisted.withTenantContext.mockImplementation(
      async (authority: unknown, action: (tx: unknown) => Promise<unknown>) => {
        const record = (kind: string, values: Record<string, unknown>) =>
          hoisted.writes.push({ authority, kind, values });
        return action({
          insert: () => ({
            values: (values: Record<string, unknown>) => {
              record('insert', values);
              const key = String(values.dedupeKey);
              const inserted = !hoisted.dedupeKeys.has(key);
              hoisted.dedupeKeys.add(key);
              return {
                onConflictDoNothing: () => ({
                  // The engagement send insert returns its id; the token insert is awaited as is.
                  returning: () => Promise.resolve(inserted ? [{ id: 'send-1' }] : []),
                  then: (resolve: (value: unknown) => void) => resolve(undefined),
                }),
              };
            },
          }),
          select: () => ({
            from: () => ({ where: () => ({ limit: async () => [{ token: 'survey-token' }] }) }),
          }),
          update: () => ({
            set: (values: Record<string, unknown>) => {
              record('update', values);
              return { where: async () => undefined };
            },
          }),
        });
      }
    );
    hoisted.sendNpsSurveyEmail.mockResolvedValue({ success: true, id: 'message-1' });
    hoisted.logAuditEvent.mockResolvedValue(undefined);
  });

  const run = (ingress = INGRESS) =>
    runNpsCronCore({ ingress, now: new Date('2026-01-15T00:00:00.000Z'), headers: new Headers() });

  it('runs every send, token and audit write under the member tenant authority', async () => {
    hoisted.selectActiveSubscriptionMembers.mockResolvedValue([
      memberOf('tenant-a', 'sub-a'),
      memberOf('tenant-b', 'sub-b'),
    ]);

    const results = await run();

    expect(results).toEqual({ sent: 2, skipped: 0, errors: 0 });
    expect(hoisted.listScheduledTenantWork).toHaveBeenCalledWith(INGRESS);
    // pending send, survey token and sent update for each member, tenant A then tenant B.
    expect(writes().map(write => write.authority)).toEqual([
      authorityA,
      authorityA,
      authorityA,
      authorityB,
      authorityB,
      authorityB,
    ]);
    for (const write of writes().filter(entry => entry.kind === 'insert')) {
      expect(write.authority).toBe(write.values.tenantId === 'tenant-a' ? authorityA : authorityB);
    }
    expect(hoisted.logAuditEvent.mock.calls.map(([event]) => event.authority)).toEqual([
      authorityA,
      authorityB,
    ]);
    for (const [event] of hoisted.logAuditEvent.mock.calls) {
      expect(event).not.toHaveProperty('tenantId');
    }
  });

  it('skips a member whose tenant was not scheduled and writes nothing for it', async () => {
    hoisted.selectActiveSubscriptionMembers.mockResolvedValue([
      memberOf('tenant-unlisted', 'sub-x'),
      memberOf(null, 'sub-y'),
    ]);

    const results = await run();

    expect(results).toEqual({ sent: 0, skipped: 2, errors: 0 });
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.sendNpsSurveyEmail).not.toHaveBeenCalled();
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
  });

  it('records a failed send and its audit event under the tenant authority', async () => {
    hoisted.sendNpsSurveyEmail.mockResolvedValue({ success: false, error: 'boom' });
    hoisted.selectActiveSubscriptionMembers.mockResolvedValue([memberOf('tenant-b', 'sub-b')]);

    const results = await run();

    expect(results).toEqual({ sent: 0, skipped: 0, errors: 1 });
    expect(writes().every(write => write.authority === authorityB)).toBe(true);
    expect(writes().at(-1)?.values).toMatchObject({ status: 'error', error: 'boom' });
    expect(hoisted.logAuditEvent.mock.calls[0]?.[0]).toMatchObject({ action: 'email.nps.failed' });
    expect(hoisted.logAuditEvent.mock.calls[0]?.[0].authority).toBe(authorityB);
  });

  it('does nothing for a request that was not admitted', async () => {
    const notAdmitted = Object.freeze({}) as IngressCapability<'cron'>;

    await expect(run(notAdmitted)).rejects.toThrow('Ingress capability required');

    expect(hoisted.selectActiveSubscriptionMembers).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.sendNpsSurveyEmail).not.toHaveBeenCalled();
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
  });
  it('records suppressed NPS mail as skipped with no delivery receipt', async () => {
    hoisted.selectActiveSubscriptionMembers.mockResolvedValue([memberOf('tenant-a', 'sub-a')]);
    hoisted.sendNpsSurveyEmail.mockResolvedValue({
      success: false,
      suppressed: true,
      error: 'email_suppressed',
    });
    expect(await run()).toEqual({ sent: 0, skipped: 1, errors: 0 });
    expect(
      writes()
        .filter(write => write.kind === 'update')
        .map(write => write.values)
    ).toEqual([{ status: 'skipped', error: 'email_suppressed' }]);
    expect(await run()).toEqual({ sent: 0, skipped: 1, errors: 0 });
    expect(hoisted.sendNpsSurveyEmail).toHaveBeenCalledTimes(1);
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
  });
});
