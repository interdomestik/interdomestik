import {
  runtimeRole,
  withPaymentPortDatabase,
  type PaymentPortDatabase,
} from '../../../database/test/exchange-rates.fixture';
import {
  END,
  LATER,
  START,
  insert,
  row,
  seedSponsorScope,
  uid,
  type Scope,
} from '../../../database/test/sponsor-test-fixture';
import { expect, it, vi } from 'vitest';
import type { SponsorMailDeps } from './mail-sender';

type Admin = PaymentPortDatabase['admin'];

async function grantSponsorProofAccess(admin: Admin) {
  // These grants apply to the disposable test database. The commands use the restricted login.
  await admin.unsafe(`grant usage on schema public to ${runtimeRole}`);
  await admin.unsafe(`grant select on "user", subscriptions, sponsors, legal_entities,
    sponsor_terms, sponsor_roster_entries, sponsor_handover_intents, sponsor_term_revisions,
    sponsor_revision_decisions, sponsor_mail_outbox to ${runtimeRole}`);
  await admin.unsafe(`grant update (id) on sponsor_terms to ${runtimeRole}`);
  await admin.unsafe(`grant update on sponsor_roster_entries to ${runtimeRole}`);
  await admin.unsafe(`grant insert, update, delete on sponsor_mail_outbox to ${runtimeRole}`);
  await admin.unsafe(`grant insert on audit_log to ${runtimeRole}`);
}

async function addTerm(
  admin: Admin,
  scope: Scope,
  start: string,
  end: string,
  effectiveEnd?: string
) {
  const id = uid();
  await insert(admin, 'sponsor_terms', {
    ...row(scope, 'sponsor_terms', true),
    id,
    term_start: start,
    term_end: end,
    ...(effectiveEnd
      ? {
          terminated_effective_at: effectiveEnd,
          terminated_at: effectiveEnd,
          terminated_by: scope.staff,
        }
      : {}),
  });
  return id;
}

async function addEntry(
  admin: Admin,
  scope: Scope,
  termId: string,
  userId: string | null,
  hash: string
) {
  const id = uid();
  const data = {
    ...row(scope, 'sponsor_roster_entries', true),
    id,
    term_id: termId,
    user_id: userId,
    optout_token_hash: hash,
  };
  await insert(admin, 'sponsor_roster_entries', data);
  return id;
}

async function addDelivery(
  admin: Admin,
  scope: Scope,
  entryId: string,
  state: 'queued' | 'claimed' | 'sent'
) {
  const id = uid();
  await insert(admin, 'sponsor_mail_outbox', {
    ...row(scope, 'sponsor_mail_outbox', true),
    id,
    roster_entry_id: entryId,
    kind: 'opt_out_confirmation',
    state,
    attempts: state === 'queued' ? 0 : 1,
    next_attempt_at: START,
    lease_until: state === 'claimed' ? END : null,
    terminal_at: state === 'sent' ? END : null,
  });
  return id;
}

const roster = (admin: Admin, ids: string[]) =>
  admin`select id, term_id, user_id, first_name, last_name, email_normalized, email_hmac,
    optout_token_hash, revoked_at, opted_out_at
    from sponsor_roster_entries where id in ${admin(ids)} order by id`;
const outbox = (admin: Admin, ids: string[]) =>
  admin`select id, roster_entry_id, state, attempts, lease_until, terminal_at, last_error_code
    from sponsor_mail_outbox where id in ${admin(ids)} order by id`;

it.runIf(process.env.BILLING_RLS_INTEGRATION === '1')(
  'serializes opt-out consumption and protects held mail and roster evidence under RLS',
  async () => {
    await withPaymentPortDatabase(async ({ admin }) => {
      await grantSponsorProofAccess(admin);
      const a = await seedSponsorScope(admin);
      const b = await seedSponsorScope(admin);
      // Import the application only after the scratch fixture configures its restricted login.
      const { and, eq, sponsorRosterEntries, sql } = await import('@interdomestik/database');
      const { mintTestTenantAuthority } =
        await import('@interdomestik/database/testing/tenant-authority');
      const { withTenantAuthority } =
        await import('@interdomestik/database/tenant-authority-context');
      const { optOutByToken } = await import('./opt-out');
      const { optOutTokenHash } = await import('./roster-crypto');
      const { runSponsorRetention } = await import('./retention');
      const { runSponsorMailOutbox } = await import('./mail-sender');

      const [posture] = await withTenantAuthority(mintTestTenantAuthority(a.tenant), tx =>
        tx.execute(sql`select current_user as role, rolsuper, rolbypassrls
          from pg_roles where rolname = current_user`)
      );
      expect(posture).toEqual({ role: runtimeRole, rolsuper: false, rolbypassrls: false });
      const otherTenant = await withTenantAuthority(mintTestTenantAuthority(a.tenant), tx =>
        tx
          .select({ id: sponsorRosterEntries.id })
          .from(sponsorRosterEntries)
          .where(
            and(
              eq(sponsorRosterEntries.tenantId, b.tenant),
              eq(sponsorRosterEntries.id, b.sponsor_roster_entries)
            )
          )
          .for('update')
      );
      expect(otherTenant).toEqual([]);

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
      expect(await optOutByToken(token, cutoff)).toEqual({ ok: false });
      expect(await optOutByToken(earlyToken, cutoff)).toEqual({ ok: false });
      expect(await roster(admin, seatIds)).toEqual(seatsBefore);
      expect((await roster(admin, [origin, earlyOrigin])).every(entry => !entry.opted_out_at)).toBe(
        true
      );

      const allowed = new Date(cutoff.getTime() - 1);
      const legacyToken = uid();
      const legacyOrigin = await addEntry(
        admin,
        a,
        sourceTerm,
        a.staff,
        optOutTokenHash(legacyToken)
      );
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
      expect(await optOutByToken(legacyToken, allowed)).toEqual({ ok: false });
      expect(await roster(admin, [legacyOrigin, legacyFuture])).toEqual(legacySeatsBefore);
      expect(await outbox(admin, [legacyConfirmation])).toEqual(legacyMailBefore);

      const race = await Promise.all([
        optOutByToken(token, allowed),
        optOutByToken(token, allowed),
      ]);
      expect(race).toEqual(expect.arrayContaining([{ ok: true, revoked: 2 }, { ok: false }]));
      expect(await optOutByToken(token, allowed)).toEqual({ ok: false });
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

      const held = await addEntry(admin, b, b.sponsor_terms, null, uid());
      const queued = await addDelivery(admin, b, held, 'queued');
      const claimed = await addDelivery(admin, b, held, 'claimed');
      const terminal = await addDelivery(admin, b, held, 'sent');
      const separateSponsor = uid();
      await insert(admin, 'sponsors', { ...row(b, 'sponsors', true), id: separateSponsor });
      const liveTerm = await addTerm(
        admin,
        { ...b, sponsors: separateSponsor },
        '2051-01-01T00:00:00.000Z',
        '2052-01-01T00:00:00.000Z'
      );
      const live = await addEntry(admin, b, liveTerm, b.user, uid());
      const eligible = await addDelivery(admin, b, live, 'queued');
      const heldBefore = await roster(admin, [held]);
      const heldMailBefore = await outbox(admin, [queued, claimed, terminal]);
      const mailNow = new Date('2051-04-01T00:00:00.000Z');
      const deps: SponsorMailDeps = {
        locale: 'en',
        secret: 'synthetic-fixture-secret',
        appUrl: 'https://example.test',
        supportEmail: 'support@example.test',
        formatDate: date => date.toISOString(),
        hasCredential: vi.fn(() => Promise.resolve(false)),
        sendMail: vi.fn(() => Promise.resolve({ ok: true })),
        sendActivation: vi.fn(() => Promise.resolve({ ok: true })),
        reportError: vi.fn(),
      };
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(mailNow);
      try {
        const authority = mintTestTenantAuthority(b.tenant);
        expect(await runSponsorRetention(authority, { now: mailNow })).toEqual({
          state: 'skipped',
          reason: 'sponsor_retention_dormant',
        });
        expect(await roster(admin, [held])).toEqual(heldBefore);
        expect(await outbox(admin, [queued, claimed, terminal])).toEqual(heldMailBefore);
        const outside = mintTestTenantAuthority(b.tenant, { accessTenantId: a.tenant });
        expect(await runSponsorMailOutbox(outside, deps, { now: mailNow, limit: 10 })).toEqual({
          claimed: 0,
          outcomes: {},
        });
        expect(await runSponsorMailOutbox(authority, deps, { now: mailNow, limit: 10 })).toEqual({
          claimed: 4,
          outcomes: { sent: 1, skipped: 3 },
        });
      } finally {
        vi.useRealTimers();
      }
      expect(deps.sendMail).toHaveBeenCalledExactlyOnceWith(
        `${b.user}@example.test`,
        expect.objectContaining({ kind: 'opt_out_confirmation' }),
        expect.any(Function)
      );
      expect(deps.sendActivation).not.toHaveBeenCalled();
      expect(deps.reportError).not.toHaveBeenCalled();
      expect(await roster(admin, [held])).toEqual(heldBefore);
      expect(await outbox(admin, [terminal])).toEqual(
        heldMailBefore.filter(mail => mail.id === terminal)
      );
      const aged = await outbox(admin, [queued, claimed]);
      expect(aged).toHaveLength(2);
      for (const mail of aged) {
        expect(mail).toMatchObject({
          roster_entry_id: held,
          state: 'skipped',
          attempts: mail.id === queued ? 1 : 2,
          terminal_at: expect.anything(),
          lease_until: null,
          last_error_code: 'aged_mail',
        });
      }
      expect((await outbox(admin, [eligible]))[0]).toMatchObject({ state: 'sent', attempts: 1 });
    });
  },
  60_000
);
