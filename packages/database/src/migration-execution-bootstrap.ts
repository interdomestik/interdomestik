import { inspectMigrationLedgerCatalog } from './migration-ledger-catalog';
import type { LedgerCatalogState } from './migration-ledger-contracts';
import {
  MigrationExecutionFault,
  type MigrationExecutionSql,
} from './migration-execution-contracts';

type PublicProbe = Readonly<{
  pid: number;
  public_count: number;
  owner_ok: boolean | null;
  acl_ok: boolean | null;
}>;

function validPublic(row: PublicProbe | undefined, expectedPid: number): boolean {
  return Boolean(
    row &&
    row.pid === expectedPid &&
    row.public_count === 1 &&
    row.owner_ok === true &&
    row.acl_ok === true
  );
}

export async function validatePublicSchema(
  sql: MigrationExecutionSql,
  expectedPid: number
): Promise<void> {
  const rows = await sql<PublicProbe[]>`
    SELECT pg_backend_pid()::int AS pid,
      count(*)::int AS public_count,
      bool_and(n.nspowner = (SELECT oid FROM pg_catalog.pg_roles
        WHERE rolname = current_user)) AS owner_ok,
      bool_and(NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(n.nspacl,
          pg_catalog.acldefault('n', n.nspowner))) acl
        WHERE acl.grantee <> n.nspowner AND acl.privilege_type = 'CREATE'
      )) AS acl_ok
    FROM pg_catalog.pg_namespace n WHERE n.nspname = 'public'
  `;
  if (!validPublic(rows[0], expectedPid))
    throw new MigrationExecutionFault('MIGRATION_EXECUTION_PUBLIC_SCHEMA_REJECTED');
}

export async function bootstrapMigrationLedger(
  sql: MigrationExecutionSql,
  catalog: LedgerCatalogState
): Promise<void> {
  try {
    if (catalog === 'schema_absent') await sql`CREATE SCHEMA drizzle`;
    if (catalog !== 'table_present')
      await sql`CREATE TABLE drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
      )`;
    if ((await inspectMigrationLedgerCatalog(sql)) !== 'table_present')
      throw new MigrationExecutionFault('MIGRATION_EXECUTION_BOOTSTRAP_FAILED');
  } catch (error) {
    if (error instanceof MigrationExecutionFault) throw error;
    throw new MigrationExecutionFault('MIGRATION_EXECUTION_BOOTSTRAP_FAILED');
  }
}
