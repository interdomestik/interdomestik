import { createHash, randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';

import { restricted, runtimeRole } from './exchange-rates-restricted.fixture';
import {
  migrateJournalBeforeNotificationDeliveries,
  migrateJournalThrough,
} from './journal-prefix.support';
import { scratchServerMissing, withScratchDatabase } from './pg16/scratch-database';
import { runSequentially } from './in-order';
import { quoteIdentifier } from './rls-test-connection';
import {
  END,
  MID,
  START,
  insert,
  seedSponsorScope,
  uid,
  type Row,
  type Scope,
  type Tx,
} from './sponsor-seed.test-support';
import { grantNotificationDeliveryRowLocks } from './wp11-notification-deliveries-rls.fixture';

export const tables = [
  'membership_import_assignments',
  'sponsor_contract_years',
  'membership_import_lists',
  'membership_import_rows',
  'sponsor_contract_year_seats',
  'sponsor_exit_events',
  'membership_notice_obligations',
  'membership_opt_out_tokens',
] as const;
export type Table = (typeof tables)[number];
export type Records = Record<Table, Row & { id: string }>;

const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));

export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** An opaque protected reference: a kind prefix and a UUID, never content. */
export function ref(kind: string): string {
  return `${kind}:${randomUUID()}`;
}

function records(scope: Scope): Records {
  const ids = Object.fromEntries(tables.map(table => [table, uid()]));
  const tenant = { tenant_id: scope.tenant, legal_entity_id: scope.entity };
  const company = { ...tenant, contract_year_id: ids.sponsor_contract_years };
  const roster = {
    ...company,
    import_row_id: ids.membership_import_rows,
    seat_id: ids.sponsor_contract_year_seats,
  };
  const listDigest = digest(ids.membership_import_lists);

  return {
    membership_import_assignments: {
      ...tenant,
      id: ids.membership_import_assignments,
      staff_user_id: scope.staff,
      capacity: 'import',
      sponsor_id: scope.sponsors,
      approved_by: scope.user,
      evidence_ref: ref('assignment'),
      valid_from: '2000-01-01T00:00:00Z',
      valid_until: END,
    },
    sponsor_contract_years: {
      ...tenant,
      id: ids.sponsor_contract_years,
      sponsor_id: scope.sponsors,
      term_id: scope.sponsor_terms,
      agreement_key: 'fixture-agreement',
      starts_on: '2040-01-01',
      ends_before: '2041-01-01',
      fee_model: 'fixed_fee',
      fee_minor: 100000,
      currency: 'EUR',
      signed_ceiling: 500,
      current_limit: 2,
      signed_evidence_ref: ref('agreement'),
      verified_by: scope.user,
      verified_at: START,
    },
    membership_import_lists: {
      ...company,
      id: ids.membership_import_lists,
      origin: 'new_company',
      sponsor_id: scope.sponsors,
      term_id: scope.sponsor_terms,
      commercial_revision: 1,
      upload_key: 'fixture-upload',
      upload_position: 1,
      upload_list_count: 1,
      upload_fingerprint: digest('fixture-upload'),
      template_version: 'fixture-template',
      canonicalization_version: 'fixture-canonicalization',
      digest: listDigest,
      row_count: 3,
      submitted_by: scope.staff,
      submitted_at: START,
      verified_by: scope.staff,
      verified_at: START,
      employer_approver_ref: ref('signatory'),
      employer_approved_at: START,
      employer_approval_ref: ref('roster_approval'),
      employer_approved_digest: listDigest,
    },
    membership_import_rows: {
      ...company,
      id: ids.membership_import_rows,
      list_id: ids.membership_import_lists,
      origin: 'new_company',
      source_row: 1,
      stable_identity_namespace: 'fixture-key-class',
      stable_identity_key: digest('fixture-key'),
      email_alias_key: digest('fixture-alias'),
      member_user_id: scope.user,
      member_verified_at: START,
    },
    sponsor_contract_year_seats: {
      ...company,
      id: ids.sponsor_contract_year_seats,
      import_row_id: ids.membership_import_rows,
      slot: 2,
      year_current_limit: 2,
    },
    sponsor_exit_events: {
      ...company,
      id: ids.sponsor_exit_events,
      agreement_key: 'fixture-agreement',
      operation_id: 'fixture-exit-operation',
      kind: 'employee_departure',
      employee_seat_id: ids.sponsor_contract_year_seats,
      recorded_by: scope.user,
      effective_at: MID,
      evidence_ref: ref('exit'),
    },
    membership_notice_obligations: {
      ...roster,
      id: ids.membership_notice_obligations,
      purpose: 'individual_notice',
      obligation_key: 'fixture-individual-notice',
      recipient_ref: ref('recipient'),
    },
    membership_opt_out_tokens: {
      ...company,
      id: ids.membership_opt_out_tokens,
      seat_id: ids.sponsor_contract_year_seats,
      notice_id: ids.membership_notice_obligations,
      format_version: 1,
      derivation_version: 1,
      token_hash: digest(ids.membership_opt_out_tokens),
      issued_by: scope.user,
    },
  };
}

export function asPrincipal<T>(
  client: postgres.Sql,
  context: { tenant?: string; home?: string; actor?: string; role?: string; dbRole?: string },
  work: (tx: Tx) => Promise<T>
) {
  return restricted(
    client,
    context.tenant,
    async tx => {
      await tx`set local statement_timeout = '8s'`;
      await tx`select set_config('app.current_actor_id', ${context.actor ?? ''}, true),
      set_config('app.current_actor_role', ${context.role ?? ''}, true)`;
      return work(tx);
    },
    context.dbRole ?? runtimeRole,
    'read committed',
    { homeTenant: context.home }
  );
}

export function adminOf(scope: Scope) {
  return { tenant: scope.tenant, actor: scope.user, role: 'tenant_admin' };
}

export function staffOf(scope: Scope) {
  return { tenant: scope.tenant, actor: scope.staff, role: 'staff' };
}

/** The admin holding the fixture's list-decision delegation, approved by the other admin. */
export function deciderOf(scope: Scope) {
  return { tenant: scope.tenant, actor: scope.decider, role: 'tenant_admin' };
}

const staffWritten = new Set<Table>([
  'membership_import_lists',
  'membership_import_rows',
  'sponsor_contract_year_seats',
]);

/** Assigned staff submit lists, rows and seats; a tenant admin writes the other tables. */
export function writerOf(scope: Scope, table: Table) {
  return staffWritten.has(table) ? staffOf(scope) : adminOf(scope);
}

export function delegation(scope: Scope, legalEntityId = scope.entity): Row & { id: string } {
  return {
    id: uid(),
    tenant_id: scope.tenant,
    legal_entity_id: legalEntityId,
    staff_user_id: scope.decider,
    capacity: 'decision',
    sponsor_id: scope.sponsors,
    approved_by: scope.user,
    evidence_ref: ref('delegation'),
    valid_from: '2000-01-01T00:00:00Z',
    valid_until: END,
  };
}

/**
 * What the dormant migration grants nobody. The writer PR's commands will need these, so the
 * suite grants them to the runtime role after the migration to prove the policies themselves.
 */
export const PROSPECTIVE_GRANTS = [
  `grant select, insert on table ${tables.map(table => `public.${table}`).join(', ')}`,
  'grant update (revoked_at, revoked_by) on public.membership_import_assignments',
  'grant update (decision, decided_by, decided_at, decided_digest) on public.membership_import_lists',
  'grant update (current_limit) on public.sponsor_contract_years',
];

type Fixture = {
  db: postgres.Sql;
  a: Scope;
  b: Scope;
  home: Records;
  away: Records;
  unprivilegedRole: string;
  /** The runtime role's table privileges on the eight tables right after the migration. */
  migratedPrivileges: { table: string; privilege: string }[];
};

export async function insertRecord(tx: Tx, table: Table, row: Row): Promise<void> {
  if (table === 'sponsor_contract_years') {
    // Text input for jsonb: the insert helper does not carry tx.json's type into the bind.
    await tx`insert into sponsor_contract_years ${tx({ ...row, benefits: '{}' })}`;
    return;
  }
  await insert(tx, table, row);
}

async function insertRecords(db: postgres.Sql, scope: Scope, rows: Records) {
  // Later tables reference earlier ones, so insert in declaration order, each as its writer.
  await runSequentially(tables, table =>
    asPrincipal(db, writerOf(scope, table), tx => insertRecord(tx, table, rows[table]))
  );
  await asPrincipal(db, adminOf(scope), tx =>
    insertRecord(tx, 'membership_import_assignments', delegation(scope))
  );
}

async function seedDecider(db: postgres.Sql, scope: Scope) {
  scope.decider = uid();
  await insert(db, 'user', {
    id: scope.decider,
    tenant_id: scope.tenant,
    name: 'Test',
    email: `${scope.decider}@example.test`,
    emailVerified: false,
    createdAt: START,
    updatedAt: START,
  });
}

function runtimePrivileges(db: postgres.Sql) {
  return db<{ table: string; privilege: string }[]>`
    select table_name as table, privilege_type as privilege
    from information_schema.role_table_grants
    where grantee = ${runtimeRole} and table_schema = 'public' and table_name in ${db(tables)}
    union
    select table_name, 'column ' || privilege_type || ' ' || column_name
    from information_schema.role_column_grants
    where grantee = ${runtimeRole} and table_schema = 'public' and table_name in ${db(tables)}
    order by 1, 2`;
}

export async function withWp09Fixture(t: TestContext, run: (fixture: Fixture) => Promise<void>) {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);

  await withScratchDatabase(
    'wp09_import',
    async db => {
      const unprivilegedRole = `wp09_no_access_${randomUUID().slice(0, 8)}`;
      const otherRole = quoteIdentifier(unprivilegedRole);
      const [existing] = await db`select 1 from pg_roles where rolname = ${runtimeRole}`;
      if (!existing) await db.unsafe(`create role ${runtimeRole} nologin nosuperuser nobypassrls`);
      try {
        await db.unsafe(`create role ${otherRole} nologin nosuperuser nobypassrls`);
        try {
          // The runtime role exists before the migrations, as in every environment. Supply
          // 0105's row-lock prerequisite at its checkpoint, then build through WP-09.
          await migrateJournalBeforeNotificationDeliveries(db, migrations);
          await grantNotificationDeliveryRowLocks(db);
          await migrateJournalThrough(db, migrations, { name: 'wp09_import_assignment_capacity' });
          const migratedPrivileges = [...(await runtimePrivileges(db))];
          await runSequentially(PROSPECTIVE_GRANTS, grant =>
            db.unsafe(`${grant} to ${runtimeRole}`).then(() => undefined)
          );
          await db.unsafe(`grant usage on schema public to ${runtimeRole}, ${otherRole}`);
          const a = await seedSponsorScope(db);
          const b = await seedSponsorScope(db);
          await seedDecider(db, a);
          await seedDecider(db, b);
          const home = records(a);
          const away = records(b);
          await insertRecords(db, a, home);
          await insertRecords(db, b, away);
          await run({ db, a, b, home, away, unprivilegedRole, migratedPrivileges });
        } finally {
          await db.unsafe(`drop owned by ${otherRole}`);
          await db.unsafe(`drop role ${otherRole}`);
        }
      } finally {
        if (!existing) {
          await db.unsafe(`drop owned by ${runtimeRole}`);
          await db.unsafe(`drop role ${runtimeRole}`);
        }
      }
    },
    { maxConnections: 3 }
  );
}
