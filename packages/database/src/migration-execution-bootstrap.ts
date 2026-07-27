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
  foreign_owner_count: number;
  collision_count: number;
}>;

function validPublic(row: PublicProbe | undefined, expectedPid: number): boolean {
  return Boolean(
    row?.pid === expectedPid &&
    row.public_count === 1 &&
    row.owner_ok === true &&
    row.acl_ok === true &&
    row.foreign_owner_count === 0 &&
    row.collision_count === 0
  );
}

export async function validatePublicSchema(
  sql: MigrationExecutionSql,
  expectedPid: number
): Promise<void> {
  const rows = await sql<PublicProbe[]>`
    WITH public_schema AS MATERIALIZED (
      SELECT n.oid FROM pg_catalog.pg_namespace n WHERE n.nspname = 'public'
    ), migration_role AS MATERIALIZED (
      SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = current_user
    ), foreign_owned(object_oid) AS (
      SELECT o.oid FROM pg_catalog.pg_class o, public_schema s, migration_role r
        WHERE o.relnamespace = s.oid AND o.relowner <> r.oid
      UNION ALL SELECT o.oid FROM pg_catalog.pg_type o, public_schema s, migration_role r
        WHERE o.typnamespace = s.oid AND o.typowner <> r.oid
      UNION ALL SELECT o.oid FROM pg_catalog.pg_proc o, public_schema s, migration_role r
        WHERE o.pronamespace = s.oid AND o.proowner <> r.oid
      UNION ALL SELECT o.oid FROM pg_catalog.pg_operator o, public_schema s, migration_role r
        WHERE o.oprnamespace = s.oid AND o.oprowner <> r.oid
      UNION ALL SELECT o.oid FROM pg_catalog.pg_collation o, public_schema s, migration_role r
        WHERE o.collnamespace = s.oid AND o.collowner <> r.oid
      UNION ALL SELECT o.oid FROM pg_catalog.pg_conversion o, public_schema s, migration_role r
        WHERE o.connamespace = s.oid AND o.conowner <> r.oid
      UNION ALL SELECT o.oid FROM pg_catalog.pg_opclass o, public_schema s, migration_role r
        WHERE o.opcnamespace = s.oid AND o.opcowner <> r.oid
      UNION ALL SELECT o.oid FROM pg_catalog.pg_opfamily o, public_schema s, migration_role r
        WHERE o.opfnamespace = s.oid AND o.opfowner <> r.oid
      UNION ALL SELECT o.oid FROM pg_catalog.pg_ts_config o, public_schema s, migration_role r
        WHERE o.cfgnamespace = s.oid AND o.cfgowner <> r.oid
      UNION ALL SELECT o.oid FROM pg_catalog.pg_ts_dict o, public_schema s, migration_role r
        WHERE o.dictnamespace = s.oid AND o.dictowner <> r.oid
    ), collisions(object_oid) AS (
      SELECT p.oid FROM public_schema s JOIN pg_catalog.pg_class p ON p.relnamespace = s.oid
        JOIN pg_catalog.pg_class c ON c.relname = p.relname
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'pg_catalog'
      UNION ALL SELECT p.oid FROM public_schema s JOIN pg_catalog.pg_type p ON p.typnamespace = s.oid
        JOIN pg_catalog.pg_type c ON c.typname = p.typname
        JOIN pg_catalog.pg_namespace n ON n.oid = c.typnamespace
        WHERE n.nspname = 'pg_catalog'
      UNION ALL SELECT p.oid FROM public_schema s JOIN pg_catalog.pg_proc p ON p.pronamespace = s.oid
        JOIN pg_catalog.pg_proc c ON c.proname = p.proname AND c.proargtypes = p.proargtypes
        JOIN pg_catalog.pg_namespace n ON n.oid = c.pronamespace
        WHERE n.nspname = 'pg_catalog'
      UNION ALL SELECT p.oid FROM public_schema s JOIN pg_catalog.pg_operator p ON p.oprnamespace = s.oid
        JOIN pg_catalog.pg_operator c ON c.oprname = p.oprname
          AND c.oprleft = p.oprleft AND c.oprright = p.oprright
        JOIN pg_catalog.pg_namespace n ON n.oid = c.oprnamespace
        WHERE n.nspname = 'pg_catalog'
      UNION ALL SELECT p.oid FROM public_schema s JOIN pg_catalog.pg_collation p ON p.collnamespace = s.oid
        JOIN pg_catalog.pg_collation c ON c.collname = p.collname
          AND c.collencoding = p.collencoding
        JOIN pg_catalog.pg_namespace n ON n.oid = c.collnamespace
        WHERE n.nspname = 'pg_catalog'
      UNION ALL SELECT p.oid FROM public_schema s JOIN pg_catalog.pg_conversion p ON p.connamespace = s.oid
        JOIN pg_catalog.pg_conversion c ON c.conname = p.conname
        JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'pg_catalog'
      UNION ALL SELECT p.oid FROM public_schema s JOIN pg_catalog.pg_opclass p ON p.opcnamespace = s.oid
        JOIN pg_catalog.pg_opclass c ON c.opcname = p.opcname AND c.opcmethod = p.opcmethod
        JOIN pg_catalog.pg_namespace n ON n.oid = c.opcnamespace
        WHERE n.nspname = 'pg_catalog'
      UNION ALL SELECT p.oid FROM public_schema s JOIN pg_catalog.pg_opfamily p ON p.opfnamespace = s.oid
        JOIN pg_catalog.pg_opfamily c ON c.opfname = p.opfname AND c.opfmethod = p.opfmethod
        JOIN pg_catalog.pg_namespace n ON n.oid = c.opfnamespace
        WHERE n.nspname = 'pg_catalog'
      UNION ALL SELECT p.oid FROM public_schema s JOIN pg_catalog.pg_ts_config p ON p.cfgnamespace = s.oid
        JOIN pg_catalog.pg_ts_config c ON c.cfgname = p.cfgname
        JOIN pg_catalog.pg_namespace n ON n.oid = c.cfgnamespace
        WHERE n.nspname = 'pg_catalog'
      UNION ALL SELECT p.oid FROM public_schema s JOIN pg_catalog.pg_ts_dict p ON p.dictnamespace = s.oid
        JOIN pg_catalog.pg_ts_dict c ON c.dictname = p.dictname
        JOIN pg_catalog.pg_namespace n ON n.oid = c.dictnamespace
        WHERE n.nspname = 'pg_catalog'
      UNION ALL SELECT p.oid FROM public_schema s JOIN pg_catalog.pg_ts_parser p ON p.prsnamespace = s.oid
        JOIN pg_catalog.pg_ts_parser c ON c.prsname = p.prsname
        JOIN pg_catalog.pg_namespace n ON n.oid = c.prsnamespace
        WHERE n.nspname = 'pg_catalog'
      UNION ALL SELECT p.oid FROM public_schema s JOIN pg_catalog.pg_ts_template p ON p.tmplnamespace = s.oid
        JOIN pg_catalog.pg_ts_template c ON c.tmplname = p.tmplname
        JOIN pg_catalog.pg_namespace n ON n.oid = c.tmplnamespace
        WHERE n.nspname = 'pg_catalog'
    )
    SELECT pg_catalog.pg_backend_pid()::int AS pid,
      count(*)::int AS public_count,
      bool_and(n.nspowner = (SELECT oid FROM pg_catalog.pg_roles
        WHERE rolname = current_user)) AS owner_ok,
      bool_and(NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(n.nspacl,
          pg_catalog.acldefault('n', n.nspowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'CREATE'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid <> n.nspowner
          AND r.rolsuper IS NOT TRUE
          AND CASE WHEN pg_catalog.current_setting('server_version_num')::integer >= 160000
            THEN pg_catalog.pg_has_role(r.oid, n.nspowner, 'SET')
            ELSE pg_catalog.pg_has_role(r.oid, n.nspowner, 'MEMBER') END IS NOT TRUE
          AND pg_catalog.has_schema_privilege(r.oid, n.oid, 'CREATE') IS NOT FALSE
      )) AS acl_ok,
      (SELECT count(*)::int FROM foreign_owned) AS foreign_owner_count,
      (SELECT count(*)::int FROM collisions) AS collision_count
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
