import { authority, entry, now, personRows, token, use } from './opt-out.test-support';
import {
  resolveSponsorOptOutTenant,
  sponsorMailOutbox,
  sponsorRosterEntries,
} from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { describe, expect, it, vi } from 'vitest';

import { SPONSOR_SYSTEM_ACTOR } from './audit';
import { auditTransaction, expectAudits } from './audit-test-support';
import { leaveSponsorship, markLeftCompany, optOutByToken } from './opt-out';

const actor = { userId: 'usr_staff', role: 'staff', branchId: null, agentTier: null };

describe('revocation audit', () => {
  it.each(['member', null])(
    'attributes token opt-out to system even for bound user %s',
    async userId => {
      const db = auditTransaction({ selects: personRows(userId) });
      use(db);
      expect(await optOutByToken(token, now)).toEqual({ ok: true, revoked: 2 });
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
  it('does not audit another member or an already revoked origin', async () => {
    const db = auditTransaction({ selects: personRows('other') });
    use(db);
    expect(
      (await leaveSponsorship(authority, { userId: 'member' }, { entryId: 'entry', now })).ok
    ).toBe(false);
    expectAudits(db, []);
    const rows = personRows();
    rows[3][0].revokedAt = '2026-12-31T00:00:00Z';
    const revoked = auditTransaction({ selects: rows });
    use(revoked);
    expect(await optOutByToken(token, now)).toEqual({ ok: false });
    expect(revoked.writes).toEqual([]);
  });
  it('locks the sponsor terms for share then roster entries including the past origin', async () => {
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
      await optOutByToken(token, now);
      return locks;
    };
    expect(await run(personRows())).toEqual([['join'], ['share'], ['update']]);
    const ended = personRows();
    ended[2] = [{ id: 'term', termEnd: '2026-01-01T00:00:00Z', terminatedEffectiveAt: null }];
    expect(await run(ended)).toEqual([['join'], ['share'], ['update']]);
  });
  it('does not open a transaction for an invalid token', async () => {
    vi.mocked(resolveSponsorOptOutTenant).mockResolvedValue(null);
    vi.mocked(withTenantAuthority).mockClear();
    expect(await optOutByToken('unknown', now)).toEqual({ ok: false });
    expect(withTenantAuthority).not.toHaveBeenCalled();
  });
});

describe('locked origin authority', () => {
  it.each([
    ['30-day boundary', '2026-12-02T00:00:00Z', null],
    ['early termination boundary', '2027-02-01T00:00:00Z', '2026-12-02T00:00:00Z'],
  ])(
    'refuses the %s without a retention pass, even when there is a renewed seat',
    async (_, termEnd, terminatedEffectiveAt) => {
      const rows = personRows();
      Object.assign(rows[2][0], { termEnd, terminatedEffectiveAt });
      const db = auditTransaction({ selects: rows });
      use(db);
      expect(await optOutByToken(token, now)).toEqual({ ok: false });
      expect(db.writes).toEqual([]);
    }
  );

  it.each([
    ['consumed', { optedOutAt: '2026-12-31T00:00:00Z' }],
    ['hash mismatch', { tokenHash: 'different' }],
  ])('refuses a %s origin even when the discovery lookup resolves it', async (_, patch) => {
    const rows = personRows();
    Object.assign(rows[3][0], patch);
    const db = auditTransaction({ selects: rows });
    use(db);
    expect(await optOutByToken(token, now)).toEqual({ ok: false });
    expect(db.writes).toEqual([]);
  });

  it('refuses a legacy confirmation replay before revoking a later seat', async () => {
    const rows = personRows();
    Object.assign(rows[2][0], { termEnd: '2026-12-03T00:00:00Z' });
    // The old writer queued the confirmation but left the past origin untouched.
    rows.push([{ id: 'legacy-confirmation' }]);
    const db = auditTransaction({ selects: rows });
    use(db);

    expect(await optOutByToken(token, now)).toEqual({ ok: false });
    expect(db.writes).toEqual([]);
  });

  it('consumes a valid past origin and revokes current and future seats with one confirmation', async () => {
    const rows = personRows();
    Object.assign(rows[2][0], { termEnd: '2026-12-03T00:00:00Z' });
    rows[2].push({ id: 'live', termEnd: '2027-02-01T00:00:00Z', terminatedEffectiveAt: null });
    rows[3].push(entry('current', 'live', 'member'));
    const db = auditTransaction({ selects: rows });
    use(db);
    const result = await optOutByToken(token, now);
    const rosterWrites = db.writes.filter(write => write.table === sponsorRosterEntries);
    expect(rosterWrites.map(write => write.values)).toEqual([
      { optedOutAt: now.toISOString() },
      expect.objectContaining({ revokedAt: now.toISOString(), revokedReason: 'opted_out' }),
    ]);
    expect(rosterWrites[1].values).not.toHaveProperty('optoutTokenHash');
    expect(result).toEqual({ ok: true, revoked: 2 });
    expect(db.audits().map(audit => audit.entityId)).toEqual(['future', 'current']);
    expect(db.writes.filter(write => write.table === sponsorMailOutbox)).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({ rosterEntryId: 'entry', kind: 'opt_out_confirmation' }),
      }),
    ]);
    Object.assign(rows[3][0], rosterWrites[0].values);
    const replay = auditTransaction({ selects: rows });
    use(replay);
    expect(await optOutByToken(token, now)).toEqual({ ok: false });
    expect(replay.writes).toEqual([]);
  });

  it('resolves changed identity afresh before any effect', async () => {
    const previous = personRows(null);
    Object.assign(previous[3][0], { userId: 'member' });
    const stale = auditTransaction({ selects: previous });
    const fresh = auditTransaction({ selects: personRows() });
    vi.mocked(resolveSponsorOptOutTenant).mockClear();
    vi.mocked(withTenantAuthority)
      .mockImplementationOnce(async (_authority, fn) => fn(stale.tx))
      .mockImplementationOnce(async (_authority, fn) => fn(fresh.tx));
    expect(await optOutByToken(token, now)).toEqual({ ok: true, revoked: 2 });
    expect(resolveSponsorOptOutTenant).toHaveBeenCalledTimes(2);
    expect(stale.writes).toEqual([]);
    expect(fresh.audits()).toHaveLength(2);
  });

  it('consumes and confirms a valid past origin even when there are no seats left to revoke', async () => {
    const rows = personRows();
    Object.assign(rows[2][0], { termEnd: '2026-12-03T00:00:00Z' });
    rows[2].pop();
    rows[3].pop();
    const db = auditTransaction({ selects: rows });
    use(db);
    expect(await optOutByToken(token, now)).toEqual({ ok: true, revoked: 0 });
    expect(db.writes.map(write => write.table)).toEqual([sponsorRosterEntries, sponsorMailOutbox]);
    expect(db.audits()).toEqual([]);
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
