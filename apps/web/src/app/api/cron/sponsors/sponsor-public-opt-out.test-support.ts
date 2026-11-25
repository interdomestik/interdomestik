import { optOutTokenHash } from '@interdomestik/domain-membership-billing/sponsors/roster-crypto';
import { expect } from 'vitest';

import {
  insert,
  row,
  uid,
  type Scope,
} from '../../../../../../../packages/database/test/sponsor-test-fixture';
import { addEntry, addMail, addTerm, LIVE_END, type Admin } from './sponsor-routes.test-support';

export async function verifyOptOut(admin: Admin, scope: Scope, otherSponsorEntry: string) {
  const { POST } = await import('../../public/sponsor-opt-out/route');
  const optOut = (token: string) =>
    POST(
      new Request('http://localhost/api/public/sponsor-opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
    );
  // The two origin terms ended exactly 30 days and one day before the request, respectively.
  const optOutSponsor = uid();
  await insert(admin, 'sponsors', { ...row(scope, 'sponsors', true), id: optOutSponsor });
  const optOutScope = { ...scope, sponsors: optOutSponsor };
  const expiredTerm = await addTerm(
    admin,
    optOutScope,
    '2050-01-01T00:00:00.000Z',
    '2051-03-02T00:02:00.000Z'
  );
  const recentTerm = await addTerm(
    admin,
    optOutScope,
    '2051-03-02T00:02:00.000Z',
    '2051-03-31T00:02:00.000Z'
  );
  const expired = await addEntry(admin, optOutScope, expiredTerm, scope.staff);
  const valid = await addEntry(admin, optOutScope, recentTerm, scope.user);
  const legacy = await addEntry(admin, optOutScope, recentTerm, scope.staff);
  await addMail(admin, optOutScope, legacy.id, {
    idempotency_key: `sponsor-entry:${legacy.id}:opt_out_confirmation`,
  });
  const liveTerm = await addTerm(admin, optOutScope, '2051-03-31T00:02:00.000Z', LIVE_END);
  const live = await addEntry(admin, optOutScope, liveTerm, scope.user);
  await addEntry(admin, optOutScope, liveTerm, scope.staff);

  const snapshot = async () => ({
    roster:
      await admin`select * from sponsor_roster_entries where tenant_id = ${scope.tenant} order by id`,
    outbox:
      await admin`select * from sponsor_mail_outbox where tenant_id = ${scope.tenant} order by id`,
    audit: await admin`select * from audit_log where tenant_id = ${scope.tenant} order by id`,
  });
  const expectRefusedWithoutWrites = async (token: string, scenario: string) => {
    const before = await snapshot();
    const response = await optOut(token);
    expect.soft(response.status, scenario).toBe(400);
    expect.soft(await response.json(), scenario).toEqual({ ok: false });
    expect.soft(await snapshot(), scenario).toEqual(before);
  };

  // The hash still resolves and
  // the person has a live successor, so removing the 30-day check permits a real mutation.
  await expectRefusedWithoutWrites(expired.token, 'expired at 30 days');
  // A legacy confirmation is the only consumption evidence for this origin.
  await expectRefusedWithoutWrites(legacy.token, 'legacy replay with confirmation only');

  const accepted = await optOut(valid.token);
  // An ended origin is consumed and its live successor is revoked.
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toEqual({ ok: true });
  expect(
    await admin`select optout_token_hash, opted_out_at is not null as consumed, revoked_at
    from sponsor_roster_entries where id = ${valid.id}`
  ).toEqual([
    { optout_token_hash: optOutTokenHash(valid.token), consumed: true, revoked_at: null },
  ]);
  expect
    .soft(await admin`select revoked_reason from sponsor_roster_entries where id = ${live.id}`)
    .toEqual([{ revoked_reason: 'opted_out' }]);
  expect
    .soft(
      await admin`select revoked_at from sponsor_roster_entries where id = ${otherSponsorEntry}`
    )
    .toEqual([{ revoked_at: null }]);
  expect
    .soft(
      await admin`select entity_id from audit_log where tenant_id = ${scope.tenant}
    and action = 'sponsor_entry.opted_out'`
    )
    .toEqual([{ entity_id: live.id }]);
  const confirmation = await admin`select id from sponsor_mail_outbox
    where roster_entry_id = ${valid.id} and kind = 'opt_out_confirmation'`;
  expect(confirmation).toHaveLength(1);
  await expectRefusedWithoutWrites(valid.token, 'replay with confirmation present');

  // With the receipt pruned and a new future roster entry in place, the
  // ended origin has only its consumption marker to stop replay from revoking the new entry.
  await admin`delete from sponsor_mail_outbox where id = ${confirmation[0].id}`;
  const futureTerm = await addTerm(admin, optOutScope, LIVE_END, '2053-01-01T00:00:00.000Z');
  await addEntry(admin, optOutScope, futureTerm, scope.user);
  await expectRefusedWithoutWrites(valid.token, 'replay after confirmation was pruned');
}
