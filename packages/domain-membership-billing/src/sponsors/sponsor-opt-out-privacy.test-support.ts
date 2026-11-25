import { expect } from 'vitest';
import {
  END,
  LATER,
  START,
  insert,
  row,
  uid,
  type Scope,
} from '../../../database/test/sponsor-test-fixture';
import type { optOutByToken } from './opt-out';
import { optOutTokenHash } from './roster-crypto';
import { addEntry, addTerm, outbox, roster, type Admin } from './sponsor-privacy.test-support';

export async function verifySponsorOptOutPrivacy(
  admin: Admin,
  a: Scope,
  b: Scope,
  optOut: typeof optOutByToken
) {
  const sourceTerm = await addTerm(admin, a, '2039-01-01T00:00:00.000Z', START);
  const nextTerm = await addTerm(admin, a, END, LATER);
  // The term exclusion constraint uses scheduled dates, even after early termination.
  const earlyScope = { ...a, sponsors: uid() };
  await insert(admin, 'sponsors', { ...row(a, 'sponsors', true), id: earlyScope.sponsors });
  const earlyTerm = await addTerm(admin, earlyScope, '2039-02-01T00:00:00.000Z', END, START);
  const earlyNextTerm = await addTerm(admin, earlyScope, END, LATER);
  const token = uid();
  const earlyToken = uid();
  const origin = await addEntry(admin, a, sourceTerm, a.user, optOutTokenHash(token));
  const earlyOrigin = await addEntry(
    admin,
    earlyScope,
    earlyTerm,
    a.user,
    optOutTokenHash(earlyToken)
  );
  const earlyFuture = await addEntry(admin, earlyScope, earlyNextTerm, a.user, uid());
  const future = await addEntry(admin, a, nextTerm, a.user, uid());
  const unrelated = await addEntry(admin, a, nextTerm, null, uid());
  const untouched = [earlyFuture, unrelated, b.sponsor_roster_entries];
  const seatIds = [a.sponsor_roster_entries, future, ...untouched];
  const seatsBefore = await roster(admin, seatIds);
  const cutoff = new Date('2040-01-31T00:00:00.000Z');
  expect(await optOut(token, cutoff)).toEqual({ ok: false });
  expect(await optOut(earlyToken, cutoff)).toEqual({ ok: false });
  expect(await roster(admin, seatIds)).toEqual(seatsBefore);
  expect((await roster(admin, [origin, earlyOrigin])).every(entry => !entry.opted_out_at)).toBe(
    true
  );

  const allowed = new Date(cutoff.getTime() - 1);
  const legacyToken = uid();
  const legacyOrigin = await addEntry(admin, a, sourceTerm, a.staff, optOutTokenHash(legacyToken));
  const legacyConfirmation = uid();
  await insert(admin, 'sponsor_mail_outbox', {
    ...row(a, 'sponsor_mail_outbox', true),
    id: legacyConfirmation,
    roster_entry_id: legacyOrigin,
    kind: 'opt_out_confirmation',
    idempotency_key: `sponsor-entry:${legacyOrigin}:opt_out_confirmation`,
  });
  const legacyFuture = await addEntry(admin, a, nextTerm, a.staff, uid());
  const legacySeatsBefore = await roster(admin, [legacyOrigin, legacyFuture]);
  const legacyMailBefore = await outbox(admin, [legacyConfirmation]);
  expect(await optOut(legacyToken, allowed)).toEqual({ ok: false });
  expect(await roster(admin, [legacyOrigin, legacyFuture])).toEqual(legacySeatsBefore);
  expect(await outbox(admin, [legacyConfirmation])).toEqual(legacyMailBefore);

  const race = await Promise.all([optOut(token, allowed), optOut(token, allowed)]);
  expect(race).toEqual(expect.arrayContaining([{ ok: true, revoked: 2 }, { ok: false }]));
  expect(await optOut(token, allowed)).toEqual({ ok: false });
  expect((await roster(admin, [origin]))[0]).toMatchObject({
    revoked_at: null,
    opted_out_at: expect.anything(),
    optout_token_hash: optOutTokenHash(token),
  });
  const revoked = await roster(admin, [a.sponsor_roster_entries, future]);
  expect(revoked).toHaveLength(2);
  expect(
    revoked.every(entry => entry.revoked_at && entry.opted_out_at && entry.optout_token_hash)
  ).toBe(true);
  expect(await roster(admin, untouched)).toEqual(
    seatsBefore.filter(entry => untouched.includes(entry.id))
  );
  expect((await roster(admin, [earlyOrigin]))[0]).toMatchObject({
    revoked_at: null,
    opted_out_at: null,
    optout_token_hash: optOutTokenHash(earlyToken),
  });
  expect(
    await admin`select kind from sponsor_mail_outbox where roster_entry_id = ${origin}`
  ).toEqual([{ kind: 'opt_out_confirmation' }]);
  expect(
    await admin`select entity_id from audit_log where tenant_id = ${a.tenant}
    and action = 'sponsor_entry.opted_out' order by entity_id`
  ).toEqual(revoked.map(entry => ({ entity_id: entry.id })));
}
