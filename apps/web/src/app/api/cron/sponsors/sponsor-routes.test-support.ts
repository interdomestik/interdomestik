import {
  optOutToken,
  optOutTokenHash,
} from '@interdomestik/domain-membership-billing/sponsors/roster-crypto';
import { expect } from 'vitest';
import {
  paymentPortTestScheduledAuthority,
  runtimeRole,
  type PaymentPortDatabase,
} from '../../../../../../../packages/database/test/exchange-rates.fixture';
import {
  END,
  insert,
  row,
  uid,
  type Row,
  type Scope,
} from '../../../../../../../packages/database/test/sponsor-test-fixture';

export type Admin = PaymentPortDatabase['admin'];

export const NOW = '2051-04-01T00:02:00.000Z';
export const CRON_BEARER = 'sponsor-route-test-bearer';
export const ROSTER_SECRET = 'synthetic-sponsor-route-roster-secret';
export const LIVE_START = '2051-01-01T00:00:00.000Z';
export const LIVE_END = '2052-01-01T00:00:00.000Z';

export async function grantSponsorRuntimeAccess(admin: Admin) {
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

export async function assertRestrictedConnection(admin: Admin, scope: Scope) {
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

export async function addTerm(admin: Admin, scope: Scope, start: string, end: string) {
  const term = row(scope, 'sponsor_terms', true);
  await insert(admin, 'sponsor_terms', { ...term, term_start: start, term_end: end });
  return String(term.id);
}

export async function addEntry(admin: Admin, scope: Scope, termId: string, userId: string) {
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

export async function addMail(admin: Admin, scope: Scope, entryId: string, values: Row = {}) {
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
