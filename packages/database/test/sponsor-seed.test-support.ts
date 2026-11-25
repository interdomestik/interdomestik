import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

export const TABLES = [
  'sponsors',
  'sponsor_terms',
  'sponsor_term_revisions',
  'sponsor_revision_decisions',
  'sponsor_handover_intents',
  'sponsor_roster_entries',
  'sponsor_mail_outbox',
  'sponsor_handover_cancel_attempts',
  'sponsor_handover_charges',
] as const;
export type Table = (typeof TABLES)[number];
export type Row = Record<string, string | number | boolean | null>;
export type Tx = postgres.TransactionSql;
export type Scope = Record<string, string>;
export const START = '2040-01-01T00:00:00.000Z';
export const END = '2041-01-01T00:00:00.000Z';
export const LATER = '2042-01-01T00:00:00.000Z';
export const MID = '2040-07-01T00:00:00.000Z';
export function uid(): string {
  return `sp_test_${randomUUID()}`;
}
export function createSponsorScope(tenantId = uid()): Scope {
  const keys = 'branch user staff lead spareLead entity plan subscription pendingRevision'.split(
    ' '
  );
  return { tenant: tenantId, ...Object.fromEntries([...keys, ...TABLES].map(key => [key, uid()])) };
}
export async function insert(db: postgres.Sql | Tx, table: string, row: Row): Promise<void> {
  await db`insert into ${db(table)} ${db(row)}`;
}
export async function serial<T>(
  items: readonly T[],
  fn: (item: T) => Promise<void>
): Promise<void> {
  await items.reduce(async (previous, item) => {
    await previous;
    await fn(item);
  }, Promise.resolve());
}
export function row(s: Scope, table: Table, fresh = false): Row {
  const base = { id: fresh ? uid() : s[table], tenant_id: s.tenant };
  const rows: Record<Table, Row> = {
    sponsors: {
      ...base,
      branch_id: s.branch,
      source_lead_id: fresh ? s.spareLead : s.lead,
      legal_name: 'Test sponsor',
      billing_contact_name: 'Test billing',
      billing_contact_email: `${s.tenant}@example.test`,
      created_by: s.user,
    },
    sponsor_terms: {
      ...base,
      sponsor_id: s.sponsors,
      term_start: fresh ? END : START,
      term_end: fresh ? LATER : END,
      legal_entity_id: s.entity,
      plan_key: s.plan,
      plan_id: 'standard',
      created_by: s.user,
    },
    sponsor_term_revisions: {
      ...base,
      term_id: s.sponsor_terms,
      revision: fresh ? 3 : 1,
      seat_count: 2,
      price_per_seat_minor: 100,
      currency: 'EUR',
      contract_reference: 'test',
      terms_version: 'test-v1',
      created_by: s.user,
    },
    sponsor_revision_decisions: {
      ...base,
      revision_id: fresh ? s.pendingRevision : s.sponsor_term_revisions,
      decision: 'approved',
      decided_by: s.staff,
    },
    sponsor_handover_intents: {
      ...base,
      user_id: s.user,
      subscription_id: s.subscription,
      provider_subscription_id: fresh ? uid() : s.subscription,
    },
    sponsor_roster_entries: {
      ...base,
      term_id: s.sponsor_terms,
      first_name: 'Test',
      last_name: 'Person',
      email_normalized: `${base.id}@example.test`,
      email_hmac: base.id,
      user_id: fresh ? null : s.user,
      added_by: s.user,
      optout_token_hash: base.id,
    },
    sponsor_mail_outbox: {
      ...base,
      roster_entry_id: s.sponsor_roster_entries,
      kind: 'sponsor_notice',
      idempotency_key: base.id,
    },
    sponsor_handover_cancel_attempts: {
      ...base,
      intent_id: s.sponsor_handover_intents,
      attempt_no: fresh ? 2 : 1,
      authorizing_entry_id: s.sponsor_roster_entries,
      authorizing_term_id: s.sponsor_terms,
      authorizing_term_start: START,
      authorizing_end: END,
      boundary_at: MID,
    },
    sponsor_handover_charges: {
      ...base,
      intent_id: s.sponsor_handover_intents,
      provider_transaction_id: base.id,
      billing_period_starts_at: MID,
    },
  };
  return rows[table];
}
export async function seedSponsorRows(admin: postgres.Sql, s: Scope): Promise<void> {
  const entity = { legal_name: 'Test', country_code: 'XK' };
  await insert(admin, 'tenants', { ...entity, id: s.tenant, name: s.tenant });
  const tenant = { tenant_id: s.tenant };
  const dated = { ...tenant, updated_at: START };
  await insert(admin, 'branches', { ...tenant, id: s.branch, name: 'Test', slug: s.branch });
  await serial([s.user, s.staff], id =>
    insert(admin, 'user', {
      id,
      tenant_id: s.tenant,
      name: 'Test',
      email: `${id}@example.test`,
      emailVerified: false,
      createdAt: START,
      updatedAt: START,
    })
  );
  await serial([s.lead, s.spareLead], id =>
    insert(admin, 'member_leads', {
      id,
      tenant_id: s.tenant,
      branch_id: s.branch,
      agent_id: s.user,
      first_name: 'Test',
      last_name: 'Company',
      email: `${id}@example.test`,
      phone: '000000000',
      lead_kind: 'company',
      company_name: 'Test sponsor',
      consent_notice_version: 'p1-agent-notice-v1',
      consent_captured_at: START,
      consent_captured_by: s.user,
      capture_channel: 'agent_assisted',
      updated_at: START,
    })
  );
  await insert(admin, 'legal_entities', { ...dated, ...entity, id: s.entity });
  await insert(admin, 'membership_plans', {
    id: s.plan,
    ...dated,
    name: 'Test',
    tier: 'standard',
    price: '100.00',
  });
  await insert(admin, 'subscriptions', {
    id: s.subscription,
    tenant_id: s.tenant,
    user_id: s.user,
    plan_id: 'standard',
    provider: 'paddle',
  });
  await serial(TABLES, table => insert(admin, table, row(s, table)));
  await insert(admin, 'sponsor_term_revisions', {
    ...row(s, 'sponsor_term_revisions'),
    id: s.pendingRevision,
    revision: 2,
  });
}

/** Seeds one synthetic tenant in a caller-owned disposable database. */
export async function seedSponsorScope(admin: postgres.Sql, tenantId?: string): Promise<Scope> {
  const s = createSponsorScope(tenantId);
  await seedSponsorRows(admin, s);
  return s;
}
