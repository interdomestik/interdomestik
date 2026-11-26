import {
  runtimeRole,
  type PaymentPortDatabase,
} from '../../../database/test/exchange-rates.fixture';
import {
  END,
  START,
  insert,
  row,
  uid,
  type Scope,
} from '../../../database/test/sponsor-test-fixture';

export type Admin = PaymentPortDatabase['admin'];

export async function grantSponsorProofAccess(admin: Admin) {
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

export async function addTerm(
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

export async function addEntry(
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

export async function addDelivery(
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

export const roster = (admin: Admin, ids: string[]) =>
  admin`select id, term_id, user_id, first_name, last_name, email_normalized, email_hmac,
    optout_token_hash, revoked_at, opted_out_at
    from sponsor_roster_entries where id in ${admin(ids)} order by id`;
export const outbox = (admin: Admin, ids: string[]) =>
  admin`select id, roster_entry_id, state, attempts, lease_until, terminal_at, last_error_code
    from sponsor_mail_outbox where id in ${admin(ids)} order by id`;
