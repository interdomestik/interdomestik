import { randomBytes, randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

import type postgres from 'postgres';

import { withDisposableClient } from '../src/disposable-client';
import { migrateJournal, scratchServerMissing, withScratchDatabase } from './pg16/scratch-database';
import { quoteIdentifier, quoteSqlLiteral } from './rls-test-connection';

type Sql = postgres.Sql | postgres.TransactionSql;

export const homeTenant = 'wp12-home';
export const foreignTenant = 'wp12-foreign';
export const homeActor = 'wp12-staff';
export const foreignActor = 'wp12-foreign-staff';
export const bucket = 'claim-evidence';
export const past = '2020-01-01T00:00:00.000Z';
export const earlier = '2019-12-31T00:00:00.000Z';

export const registerTables = [
  'claim_authorities',
  'claim_correspondence',
  'claim_correspondence_documents',
] as const;

export async function seedActors(admin: Sql) {
  await admin`
    insert into tenants (id, name, legal_name, country_code)
    values (${homeTenant}, 'Home fixture', 'Home fixture', 'XK'),
           (${foreignTenant}, 'Foreign fixture', 'Foreign fixture', 'MK')`;
  await admin`
    insert into "user" (id, tenant_id, name, email, "emailVerified", role, branch_id, "createdAt", "updatedAt")
    values (${homeActor}, ${homeTenant}, 'Fixture staff', 'wp12-staff@example.test', true, 'staff', null, now(), now()),
           (${foreignActor}, ${foreignTenant}, 'Foreign staff', 'wp12-foreign@example.test', true, 'staff', null, now(), now())`;
}

type ClaimOptions = {
  id?: string;
  tenant?: string;
  branch?: string | null;
  category?: string;
  lifecycle?: 'draft' | 'submitted' | 'resolved';
};

export async function insertClaim(sql: Sql, options: ClaimOptions = {}) {
  const { id = randomBytes(4).toString('hex'), tenant = homeTenant, branch = null } = options;
  const { category = 'vehicle', lifecycle = 'submitted' } = options;
  const user = tenant === homeTenant ? homeActor : foreignActor;
  const recovery = lifecycle === 'resolved' ? 'resolved' : 'not_started';
  await sql`insert into claim (
    id, tenant_id, "userId", "staffId", branch_id, title, category,
    "companyName", case_lifecycle_state, recovery_lifecycle_state
  ) values (
    ${id}, ${tenant}, ${user}, ${user}, ${branch}, 'Case fixture', ${category},
    'Example organisation', ${lifecycle}, ${recovery}
  )`;
  return { id, tenant, user };
}

export type Case = Awaited<ReturnType<typeof insertClaim>>;
export type Document = ReturnType<typeof documentInput>;
export const assignedPath = (claim: Case, id: string) =>
  `pii/tenants/${claim.tenant}/claims/${claim.id}/${id}.pdf`;

export function documentInput(
  claim: Case,
  id: string = randomUUID(),
  filePath = assignedPath(claim, id)
) {
  return {
    id,
    tenant_id: claim.tenant,
    claim_id: claim.id,
    bucket,
    file_path: filePath,
    name: 'Fixture evidence',
    file_type: 'application/pdf',
    file_size: 120,
    uploaded_by: claim.user,
  };
}

export async function insertDocument(sql: Sql, document: Document) {
  await sql`insert into claim_documents ${sql(document)}`;
  return document;
}

export type StoredDocument = Awaited<ReturnType<typeof insertDocument>>;
type Kind = keyof typeof scopes;
const scopes = {
  recovery_agreement: 'recovery',
  power_of_attorney: 'representation',
  signed_assignment: 'recovery',
  consent_or_lawful_basis: 'document_sharing',
} as const;

export function grantInput(
  claim: Case,
  document: StoredDocument,
  kind: Kind = 'recovery_agreement'
) {
  return {
    id: randomUUID(),
    correlation_id: randomUUID(),
    tenant_id: claim.tenant,
    claim_id: claim.id,
    kind: String(kind),
    scope: String(scopes[kind]),
    evidence_document_id: document.id,
    evidence_bucket: document.bucket,
    evidence_file_path: document.file_path,
    version: 'v1',
    jurisdiction_country_code: kind === 'power_of_attorney' ? 'XK' : null,
    jurisdiction_attested_by_user_id: kind === 'power_of_attorney' ? claim.user : null,
    jurisdiction_attested_at: kind === 'power_of_attorney' ? past : null,
    purpose: kind === 'consent_or_lawful_basis' ? 'Disclose case evidence to insurer' : null,
    granted_at: past,
    expires_at: null as string | null,
    revoked_at: null as string | null,
    revoked_by_user_id: null as string | null,
    recorded_by_staff_id: claim.user,
  };
}

type Grant = ReturnType<typeof grantInput>;

export async function insertGrant(sql: Sql, grant: Grant) {
  await sql`insert into claim_authorities ${sql(grant)}`;
  return grant;
}

export async function createBases(sql: Sql, claim: Case, document: StoredDocument) {
  const recovery = await insertGrant(sql, grantInput(claim, document));
  const representation = await insertGrant(sql, grantInput(claim, document, 'power_of_attorney'));
  const sharing = await insertGrant(sql, grantInput(claim, document, 'consent_or_lawful_basis'));
  return { recovery, representation, sharing };
}

export function revoke(sql: Sql, grant: Grant, at = past) {
  return sql<{ revoked_at: Date }[]>`
    update claim_authorities set revoked_at = ${at}, revoked_by_user_id = ${grant.recorded_by_staff_id}
    where id = ${grant.id} returning revoked_at`;
}

export function inboundInput(claim: Case) {
  return {
    id: randomUUID(),
    tenant_id: claim.tenant,
    claim_id: claim.id,
    correlation_id: randomUUID(),
    direction: 'inbound',
    party_kind: 'insurer',
    party_organisation: 'Example insurer',
    channel: 'email',
    occurred_at: past,
    body: 'Fixture correspondence',
    in_reply_to_id: null as string | null,
    recovery_authority_id: null as string | null,
    representation_authority_id: null as string | null,
    sharing_authority_id: null as string | null,
    shared_document_count: 0,
    sharing_attested_by_user_id: null as string | null,
    sharing_attested_at: null as string | null,
    follow_up_at: null as string | null,
    decided_at: null as string | null,
    recorded_by_staff_id: claim.user,
  };
}

type Entry = ReturnType<typeof inboundInput>;
type Bases = Awaited<ReturnType<typeof createBases>>;

export function outboundInput(claim: Case, bases: Bases, documentCount = 0): Entry {
  return {
    ...inboundInput(claim),
    direction: 'outbound',
    recovery_authority_id: bases.recovery.id,
    representation_authority_id: bases.representation.id,
    sharing_authority_id: documentCount ? bases.sharing.id : null,
    shared_document_count: documentCount,
    sharing_attested_by_user_id: documentCount ? claim.user : null,
    sharing_attested_at: documentCount ? past : null,
  };
}

export async function insertEntry(sql: Sql, entry: Entry) {
  await sql`insert into claim_correspondence ${sql(entry)}`;
  return entry;
}

export function linkInput(entry: Entry, document: StoredDocument) {
  return {
    tenant_id: entry.tenant_id,
    claim_id: entry.claim_id,
    correspondence_id: entry.id,
    claim_document_id: document.id,
    document_bucket: document.bucket,
    document_file_path: document.file_path,
  };
}

type Link = ReturnType<typeof linkInput>;
export function insertLink(sql: Sql, link: Link) {
  return sql`insert into claim_correspondence_documents ${sql(link)}`;
}

export const isolationLevels = ['read committed', 'repeatable read'] as const;
type Isolation = (typeof isolationLevels)[number];

export type Connection = {
  admin: postgres.Sql;
  runtime: postgres.Sql;
  peer: postgres.Sql;
  role: string;
};

type RegisterProof = (connections: Connection) => Promise<void>;

export async function withRuntime(
  admin: postgres.Sql,
  work: RegisterProof,
  runtimeConnections = 1
) {
  const role = `wp12_runtime_${randomBytes(6).toString('hex')}`;
  const roleSql = quoteIdentifier(role);
  const password = randomBytes(24).toString('hex');
  const [{ name }] = await admin<{ name: string }[]>`select current_database() as name`;
  const database = quoteIdentifier(name);
  const runtimeUrl = new URL(process.env.DATABASE_URL!);
  runtimeUrl.pathname = `/${name}`;
  runtimeUrl.username = role;
  runtimeUrl.password = password;

  await admin.unsafe(
    `create role ${roleSql} login noinherit nosuperuser nobypassrls password ${quoteSqlLiteral(password)}`
  );
  try {
    await admin.unsafe(`grant connect, temporary on database ${database} to ${roleSql}`);
    await admin.unsafe(`grant usage on schema public to ${roleSql}`);
    // This mirrors the runtime lane's table-wide DML so every mutation trigger is reachable.
    await admin.unsafe(
      `grant select, insert, update, delete on claim, claim_documents, claim_case_fields, ${registerTables.join(', ')} to ${roleSql}`
    );
    await withDisposableClient(
      runtimeUrl.toString(),
      { applicationName: 'wp12_register_runtime', max: runtimeConnections },
      runtime =>
        withDisposableClient(
          runtimeUrl.toString(),
          { applicationName: 'wp12_register_peer' },
          peer => work({ admin, runtime, peer, role })
        )
    );
  } finally {
    await admin.unsafe(`drop owned by ${roleSql}`);
    await admin.unsafe(`drop role ${roleSql}`);
  }
}

type Scope = { home?: string; access?: string; isolation?: Isolation };

export async function setScope(
  tx: postgres.TransactionSql,
  { home = homeTenant, access = home }: Scope = {}
) {
  await tx`set local row_security = on`;
  await tx`select set_config('app.current_tenant_id', ${home}, true),
                 set_config('app.current_access_tenant_id', ${access}, true)`;
}

export function restricted<T>(
  client: postgres.Sql,
  run: (tx: postgres.TransactionSql) => Promise<T>,
  scope: Scope = {}
) {
  return client.begin(`isolation level ${scope.isolation ?? 'read committed'}`, async tx => {
    await tx`set local lock_timeout = '5s'`;
    await tx`set local statement_timeout = '8s'`;
    await setScope(tx, scope);
    return run(tx);
  });
}

export const foreignKey = (constraint_name: string) => ({ code: '23503', constraint_name });
export const unique = (constraint_name: string) => ({ code: '23505', constraint_name });

const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));

export async function withRegisterDb(t: TestContext, work: RegisterProof, runtimeConnections = 1) {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  await withScratchDatabase('wp12_register', async admin => {
    await migrateJournal(admin, migrations);
    await seedActors(admin);
    await withRuntime(admin, work, runtimeConnections);
  });
}
