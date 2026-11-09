import { resolveSponsorOptOutTenant, sponsorRosterEntries } from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SPONSOR_SYSTEM_ACTOR } from './audit';
import { auditTransaction, expectAudits } from './audit-test-support';
import { leaveSponsorship, markLeftCompany, optOutByToken } from './opt-out';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));
vi.mock('@interdomestik/database/sponsor-locks', () => ({
  lockSponsorPerson: vi.fn(),
  lockSponsorEntryIdentity: vi.fn(),
}));
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  resolveSponsorOptOutTenant: vi.fn(),
}));
const authority = mintTestTenantAuthority('tenant');
const now = new Date('2027-01-01');
const actor = { userId: 'usr_staff', role: 'staff', branchId: null, agentTier: null };
function use(db: ReturnType<typeof auditTransaction>): void {
  vi.mocked(withTenantAuthority).mockImplementation(async (_authority, fn) => fn(db.tx));
}
function personRows(userId: string | null = 'member'): Record<string, unknown>[][] {
  return [
    [{ userId, emailHmac: 'private-hmac', sponsorId: 'sponsor' }],
    [],
    [{ id: 'term', termEnd: '2099-01-01T00:00:00Z', terminatedEffectiveAt: null }],
    [{ id: 'entry' }, { id: 'future' }],
  ];
}

describe('revocation audit', () => {
  beforeEach(() => {
    vi.mocked(resolveSponsorOptOutTenant).mockResolvedValue({
      authority,
      tenantId: 'tenant',
      entryId: 'entry',
    });
  });
  it.each(['member', null])(
    'attributes token opt-out to system even for bound user %s',
    async userId => {
      const db = auditTransaction({ selects: personRows(userId) });
      use(db);
      expect(await optOutByToken('private-token', now)).toEqual({ ok: true, revoked: 2 });
      expect(db.writes[0]?.table).toBe(sponsorRosterEntries);
      expectAudits(
        db,
        ['entry', 'future'].map(entityId => ({
          action: 'sponsor_entry.opted_out',
          entityType: 'sponsor_roster_entry',
          entityId,
          ...SPONSOR_SYSTEM_ACTOR,
          metadata: { reason: 'opted_out' },
        })),
        ['private-token', 'private-hmac']
      );
      expect(db.auditBatches()).toHaveLength(1);
    }
  );
  it('attributes leave to the member and records the left reason for every entry', async () => {
    const db = auditTransaction({ selects: personRows() });
    use(db);
    expect(
      await leaveSponsorship(authority, { userId: 'member' }, { entryId: 'entry', now })
    ).toEqual({ ok: true, value: { revoked: 2 } });
    expectAudits(
      db,
      ['entry', 'future'].map(entityId => ({
        action: 'sponsor_entry.revoked',
        entityType: 'sponsor_roster_entry',
        entityId,
        actorId: 'member',
        actorRole: 'member',
        metadata: { reason: 'left' },
      })),
      ['private-hmac']
    );
    expect(db.auditBatches()).toHaveLength(1);
  });
  it('does not audit another member or an already revoked person', async () => {
    const db = auditTransaction({ selects: personRows('other') });
    use(db);
    expect(
      (await leaveSponsorship(authority, { userId: 'member' }, { entryId: 'entry', now })).ok
    ).toBe(false);
    expectAudits(db, []);
    const empty = auditTransaction({ selects: [...personRows().slice(0, 3), []] });
    use(empty);
    expect(await optOutByToken('private-token', now)).toEqual({ ok: true, revoked: 0 });
    expectAudits(empty, []);
  });
  it('locks the sponsor terms for share and only live entries for update', async () => {
    const run = async (rows: Record<string, unknown>[][]): Promise<unknown[][]> => {
      const db = auditTransaction({ selects: rows });
      const locks: unknown[][] = [];
      const select = (...args: Parameters<typeof db.tx.select>): unknown => {
        const chain = db.tx.select(...args) as unknown as Record<
          string,
          (...a: unknown[]) => unknown
        >;
        const { for: lock, innerJoin } = chain;
        chain.for = (...mode: unknown[]) => (locks.push(mode), lock(...mode));
        chain.innerJoin = (...join: unknown[]) => (locks.push(['join']), innerJoin(...join));
        return chain;
      };
      use({ ...db, tx: { ...db.tx, select } as unknown as typeof db.tx });
      await optOutByToken('private-token', now);
      return locks;
    };
    expect(await run(personRows())).toEqual([['join'], ['share'], ['update']]);
    const ended = personRows();
    ended[2] = [{ id: 'term', termEnd: '2026-01-01T00:00:00Z', terminatedEffectiveAt: null }];
    expect(await run(ended)).toEqual([['join'], ['share']]);
  });
  it('does not open a transaction for an invalid token', async () => {
    vi.mocked(resolveSponsorOptOutTenant).mockResolvedValue(null);
    vi.mocked(withTenantAuthority).mockClear();
    expect(await optOutByToken('unknown', now)).toEqual({ ok: false });
    expect(withTenantAuthority).not.toHaveBeenCalled();
  });
});

describe('left company audit', () => {
  it.each([true, false])('audits only an actually changed mark: %s', async marked => {
    const db = auditTransaction({
      selects: [
        [{ termId: 'term', branchId: 'branch', ownerAgentId: 'agent' }],
        [{ id: 'decision' }],
      ],
      updated: [marked ? [{ id: 'entry' }] : []],
    });
    use(db);
    expect(await markLeftCompany(authority, actor, { entryId: 'entry', now })).toEqual({
      ok: true,
      value: { marked },
    });
    expectAudits(
      db,
      marked
        ? [
            {
              action: 'sponsor_roster.left_company',
              entityType: 'sponsor_roster_entry',
              entityId: 'entry',
              actorId: actor.userId,
              actorRole: actor.role,
              metadata: { at: now.toISOString() },
            },
          ]
        : []
    );
  });
});
