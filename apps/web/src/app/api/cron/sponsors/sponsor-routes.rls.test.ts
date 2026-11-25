// @vitest-environment node

import {
  optOutToken,
  optOutTokenHash,
} from '@interdomestik/domain-membership-billing/sponsors/roster-crypto';
import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';

import {
  paymentPortTestScheduledAuthority,
  runtimeRole,
  withPaymentPortDatabase,
  type PaymentPortDatabase,
} from '../../../../../../../packages/database/test/exchange-rates.fixture';
import {
  END,
  insert,
  row,
  seedSponsorScope,
  uid,
  type Row,
  type Scope,
} from '../../../../../../../packages/database/test/sponsor-test-fixture';

type Admin = PaymentPortDatabase['admin'];
type SendEmail = typeof import('@interdomestik/domain-communications/email').sendEmail;
const sendEmail = vi.hoisted(() => vi.fn<SendEmail>());
vi.mock('@interdomestik/domain-communications/email', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/domain-communications/email')>()),
  sendEmail,
}));

const NOW = '2051-04-01T00:02:00.000Z';
const CRON_BEARER = 'sponsor-route-test-bearer';
const ROSTER_SECRET = 'synthetic-sponsor-route-roster-secret';
const LIVE_START = '2051-01-01T00:00:00.000Z';
const LIVE_END = '2052-01-01T00:00:00.000Z';

async function grantSponsorRuntimeAccess(admin: Admin) {
  // Reproduce application grants in this scratch database. The journal provides the policies.
  await admin.unsafe(`grant usage on schema public to ${runtimeRole}`);
  await admin.unsafe(`grant select on tenant_settings, "user", subscriptions, sponsors,
    legal_entities, sponsor_terms, sponsor_roster_entries, sponsor_handover_intents,
    sponsor_term_revisions, sponsor_revision_decisions, sponsor_mail_outbox to ${runtimeRole}`);
  await admin.unsafe(`grant update (id) on sponsors, sponsor_terms to ${runtimeRole}`);
  await admin.unsafe(`grant update on sponsor_roster_entries to ${runtimeRole}`);
  await admin.unsafe(`grant insert, update, delete on sponsor_mail_outbox to ${runtimeRole}`);
  await admin.unsafe(`grant insert on audit_log to ${runtimeRole}`);
}

async function assertRestrictedConnection(admin: Admin, scope: Scope) {
  const [{ database }] = await admin`select current_database() as database`;
  const { sql } = await import('@interdomestik/database');
  const { withTenantAuthority } = await import('@interdomestik/database/tenant-authority-context');
  const [connection] = await withTenantAuthority(
    paymentPortTestScheduledAuthority(scope.tenant),
    tx =>
      tx.execute(sql`select current_database() as database, current_user as role, rolsuper, rolbypassrls,
      current_setting('row_security') as row_security from pg_roles where rolname = current_user`)
  );
  expect(connection).toEqual({
    database,
    role: runtimeRole,
    rolsuper: false,
    rolbypassrls: false,
    row_security: 'on',
  });
  const [otherTenant] = await withTenantAuthority(
    paymentPortTestScheduledAuthority('tenant_mk'),
    tx =>
      tx.execute(
        sql`select exists(select 1 from sponsor_roster_entries where id = ${scope.sponsor_roster_entries}) as visible`
      )
  );
  expect(otherTenant).toEqual({ visible: false });
}

async function addTerm(admin: Admin, scope: Scope, start: string, end: string) {
  const term = row(scope, 'sponsor_terms', true);
  await insert(admin, 'sponsor_terms', { ...term, term_start: start, term_end: end });
  return String(term.id);
}

async function addEntry(admin: Admin, scope: Scope, termId: string, userId: string) {
  const id = uid();
  const token = optOutToken(ROSTER_SECRET, id);
  await insert(admin, 'sponsor_roster_entries', {
    ...row(scope, 'sponsor_roster_entries', true),
    id,
    term_id: termId,
    user_id: userId,
    optout_token_hash: optOutTokenHash(token),
  });
  return { id, token };
}

async function addMail(admin: Admin, scope: Scope, entryId: string, values: Row = {}) {
  const id = uid();
  await insert(admin, 'sponsor_mail_outbox', {
    ...row(scope, 'sponsor_mail_outbox', true),
    id,
    roster_entry_id: entryId,
    kind: 'opt_out_confirmation',
    next_attempt_at: END,
    ...values,
  });
  return id;
}

async function verifyHourlyCron(admin: Admin, scope: Scope, liveTerm: string) {
  const { GET } = await import('./route');
  const runCron = () =>
    GET(
      new NextRequest('http://localhost/api/cron/sponsors', {
        headers: { authorization: `Bearer ${CRON_BEARER}` },
      })
    );
  const heldId = scope.sponsor_roster_entries;
  const terminalId = scope.sponsor_mail_outbox;
  await admin`update sponsor_handover_intents set next_attempt_at = ${LIVE_END}
    where id = ${scope.sponsor_handover_intents}`;
  await admin`update sponsor_mail_outbox set state = 'sent', terminal_at = ${END}, attempts = 1
    where id = ${terminalId}`;

  const heldRoster = () => admin`select * from sponsor_roster_entries where id = ${heldId}`;
  const heldMail = () => admin`select * from sponsor_mail_outbox where id = ${terminalId}`;
  const rosterBefore = await heldRoster();
  const mailBefore = await heldMail();
  expect(rosterBefore).toHaveLength(1);
  expect(mailBefore).toHaveLength(1);
  const queued = await addMail(admin, scope, heldId, {
    attempts: 2,
    last_error_code: 'send_failed',
  });
  const abandoned = await addMail(admin, scope, heldId, {
    kind: 'renewal_notice',
    attempts: 1,
    state: 'claimed',
    lease_until: END,
  });
  const eligible = await addEntry(admin, scope, liveTerm, scope.user);
  const delivery = await addMail(admin, scope, eligible.id);
  sendEmail.mockImplementation(async (_to, _template, options) =>
    options?.canDispatch?.() === false
      ? { success: false, error: 'email_dispatch_blocked' }
      : { success: true, id: 'synthetic-delivery' }
  );

  const response = await runCron();
  expect.soft(response.status).toBe(200);
  expect.soft(await response.json()).toMatchObject({
    success: true,
    timestamp: NOW,
    tenants: expect.arrayContaining([
      expect.objectContaining({
        tenantId: scope.tenant,
        failed: false,
        retention: { state: 'skipped', reason: 'sponsor_retention_dormant' },
        mail: { claimed: 3, outcomes: { sent: 1, skipped: 2 } },
      }),
    ]),
  });
  // sponsor-cron.core.ts:102–111 and retention.ts:44–47. Both fixtures are due for destructive retention.
  expect.soft(await heldRoster()).toEqual(rosterBefore);
  expect.soft(await heldMail()).toEqual(mailBefore);
  const mailResult = (id: string) => admin`select state, attempts, last_error_code, lease_until
    from sponsor_mail_outbox where id = ${id}`;
  // mail-sender.ts:118–121 and mail-outbox.ts:42–49. These otherwise deliverable retries were due.
  expect
    .soft(await mailResult(queued))
    .toEqual([{ state: 'skipped', attempts: 3, last_error_code: 'aged_mail', lease_until: null }]);
  expect
    .soft(await mailResult(abandoned))
    .toEqual([{ state: 'skipped', attempts: 2, last_error_code: 'aged_mail', lease_until: null }]);
  // mail-sender.ts:230–238,267 and _mail.ts:41–52. Only the fresh delivery reaches the adapter.
  expect
    .soft(sendEmail)
    .toHaveBeenCalledExactlyOnceWith(
      `${scope.user}@example.test`,
      { subject: expect.any(String), text: expect.any(String), html: expect.any(String) },
      { canDispatch: expect.any(Function) }
    );
  expect
    .soft(await mailResult(delivery))
    .toEqual([{ state: 'sent', attempts: 1, last_error_code: null, lease_until: null }]);

  const next = await addEntry(admin, scope, liveTerm, scope.staff);
  const failedDelivery = await addMail(admin, scope, next.id);
  sendEmail.mockClear();
  sendEmail.mockResolvedValueOnce({ success: false, error: 'synthetic-provider-failure' });
  const failed = await runCron();
  // sponsor-cron.core.ts:122–130 and route.ts:25–29. The tenant reports a retryable mail failure.
  expect.soft(failed.status).toBe(500);
  expect.soft(await failed.json()).toMatchObject({
    success: false,
    tenants: expect.arrayContaining([
      expect.objectContaining({
        tenantId: scope.tenant,
        failed: true,
        failedSteps: ['mail'],
        mail: { claimed: 1, outcomes: { queued: 1 } },
      }),
      expect.objectContaining({ tenantId: 'tenant_mk', failed: false }),
    ]),
  });
  expect
    .soft(sendEmail)
    .toHaveBeenCalledExactlyOnceWith(`${scope.staff}@example.test`, expect.anything(), {
      canDispatch: expect.any(Function),
    });
  expect
    .soft(await mailResult(failedDelivery))
    .toEqual([{ state: 'queued', attempts: 1, last_error_code: 'send_failed', lease_until: null }]);
  return eligible.id;
}

async function verifyOptOut(admin: Admin, scope: Scope, otherSponsorEntry: string) {
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

  // public/sponsor-opt-out/route.ts:40–44 and opt-out.ts:159–170. The hash still resolves and
  // the person has a live successor, so removing the 30-day check permits a real mutation.
  await expectRefusedWithoutWrites(expired.token, 'expired at 30 days');
  // opt-out.ts:146–157. A legacy confirmation is the only consumption evidence for this origin.
  await expectRefusedWithoutWrites(legacy.token, 'legacy replay with confirmation only');

  const accepted = await optOut(valid.token);
  // opt-out.ts:181–224. An ended origin is consumed and its live successor is revoked.
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

  // opt-out.ts:138–145. With the receipt pruned and a new future roster entry in place, the
  // ended origin has only its consumption marker to stop replay from revoking the new entry.
  await admin`delete from sponsor_mail_outbox where id = ${confirmation[0].id}`;
  const futureTerm = await addTerm(admin, optOutScope, LIVE_END, '2053-01-01T00:00:00.000Z');
  await addEntry(admin, optOutScope, futureTerm, scope.user);
  await expectRefusedWithoutWrites(valid.token, 'replay after confirmation was pruned');
}

it.runIf(process.env.REQUIRE_RLS_INTEGRATION === '1')(
  'runs the hourly sponsor cron and public opt-out handlers under the runtime RLS role',
  async () => {
    const adminUrl = process.env.E2E_DATABASE_URL;
    if (!adminUrl) throw new Error('E2E_DATABASE_URL is required for the sponsor route RLS proof');
    vi.stubEnv('DATABASE_URL', adminUrl);
    vi.stubEnv('CRON_SECRET', CRON_BEARER);
    vi.stubEnv('SPONSOR_ROSTER_SECRET', ROSTER_SECRET);
    try {
      await withPaymentPortDatabase(async ({ admin }) => {
        await grantSponsorRuntimeAccess(admin);
        // The mail adapter admits deployed tenant IDs. The scratch journal seeds MK and KS.
        const scope = await seedSponsorScope(admin, 'tenant_al');
        const liveTerm = await addTerm(admin, scope, LIVE_START, LIVE_END);
        await assertRestrictedConnection(admin, scope);
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        try {
          const otherSponsorEntry = await verifyHourlyCron(admin, scope, liveTerm);
          await verifyOptOut(admin, scope, otherSponsorEntry);
        } finally {
          vi.useRealTimers();
        }
      });
    } finally {
      vi.unstubAllEnvs();
    }
  },
  60_000
);
