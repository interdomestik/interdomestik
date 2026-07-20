import {
  MigrationLedgerFault,
  type LedgerCatalogProbe,
  type LedgerCatalogState,
  type LedgerRow,
  type LedgerSql,
} from './migration-ledger-contracts';

function reject(code: ConstructorParameters<typeof MigrationLedgerFault>[0]): never {
  throw new MigrationLedgerFault(code);
}
const booleanOrNull = (value: unknown) => value === null || typeof value === 'boolean';
function validProbe(value: unknown): value is LedgerCatalogProbe {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<LedgerCatalogProbe>;
  return (
    [row.schema_count, row.table_count, row.sequence_count].every(Number.isInteger) &&
    [
      row.schema_owner_ok,
      row.schema_acl_ok,
      row.table_owner_ok,
      row.sequence_owner_ok,
      row.table_acl_ok,
      row.sequence_acl_ok,
      row.table_shape_ok,
    ].every(booleanOrNull)
  );
}

export async function inspectMigrationLedgerCatalog(sql: LedgerSql): Promise<LedgerCatalogState> {
  const rows = await sql<LedgerCatalogProbe[]>`
    WITH ns AS (
      SELECT n.oid, n.nspowner, n.nspacl
      FROM pg_catalog.pg_namespace n WHERE n.nspname = 'drizzle'
    ), tab AS (
      SELECT c.* FROM pg_catalog.pg_class c JOIN ns ON ns.oid = c.relnamespace
      WHERE c.relname = '__drizzle_migrations'
    ), seq AS (
      SELECT c.* FROM pg_catalog.pg_class c JOIN ns ON ns.oid = c.relnamespace
      WHERE c.relname = '__drizzle_migrations_id_seq'
    )
    SELECT
      (SELECT count(*)::int FROM ns) AS schema_count,
      (SELECT count(*)::int FROM tab) AS table_count,
      (SELECT count(*)::int FROM seq) AS sequence_count,
      (SELECT n.nspowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
        FROM ns n) AS schema_owner_ok,
      (SELECT NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(n.nspacl,
          pg_catalog.acldefault('n', n.nspowner))) acl
        WHERE acl.grantee <> n.nspowner AND acl.privilege_type = 'CREATE'
      ) FROM ns n) AS schema_acl_ok,
      (SELECT t.relowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
        FROM tab t) AS table_owner_ok,
      (SELECT s.relowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
        FROM seq s) AS sequence_owner_ok,
      (SELECT NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(t.relacl,
          pg_catalog.acldefault('r', t.relowner))) acl
        WHERE acl.grantee <> t.relowner
          AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      ) FROM tab t) AS table_acl_ok,
      (SELECT NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(s.relacl,
          pg_catalog.acldefault('s', s.relowner))) acl
        WHERE acl.grantee <> s.relowner AND acl.privilege_type IN ('USAGE', 'UPDATE')
      ) FROM seq s) AS sequence_acl_ok,
      (SELECT
        t.relkind = 'r' AND t.relpersistence = 'p' AND NOT t.relispartition
        AND NOT t.relrowsecurity AND NOT t.relforcerowsecurity
        AND s.relkind = 'S' AND s.relpersistence = 'p'
        AND (SELECT count(*) = 3 AND bool_and(CASE a.attnum
          WHEN 1 THEN a.attname = 'id' AND a.atttypid = 'pg_catalog.int4'::pg_catalog.regtype
            AND a.attnotnull AND a.attidentity = '' AND a.attgenerated = ''
            AND d.oid IS NOT NULL AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) =
              pg_catalog.format('nextval(%L::regclass)', s.oid::pg_catalog.regclass::text)
          WHEN 2 THEN a.attname = 'hash' AND a.atttypid = 'pg_catalog.text'::pg_catalog.regtype
            AND a.attnotnull AND d.oid IS NULL AND a.attidentity = '' AND a.attgenerated = ''
          WHEN 3 THEN a.attname = 'created_at' AND
            a.atttypid = 'pg_catalog.int8'::pg_catalog.regtype AND NOT a.attnotnull
            AND d.oid IS NULL AND a.attidentity = '' AND a.attgenerated = ''
          ELSE false END)
          FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d
            ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped)
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
          WHERE a.attrelid = t.oid AND a.attnum > 0 AND a.attisdropped)
        AND (SELECT count(*) = 1 AND bool_and(c.contype = 'p' AND c.conkey =
          ARRAY[1]::smallint[] AND NOT c.condeferrable AND NOT c.condeferred AND c.convalidated)
          FROM pg_catalog.pg_constraint c WHERE c.conrelid = t.oid)
        AND (SELECT count(*) = 1 AND bool_and(i.indisprimary AND i.indisunique
          AND i.indisvalid AND i.indisready AND i.indislive)
          FROM pg_catalog.pg_index i WHERE i.indrelid = t.oid)
        AND (SELECT count(*) = 1 FROM pg_catalog.pg_depend d WHERE
          d.classid = 'pg_catalog.pg_class'::pg_catalog.regclass AND d.objid = s.oid
          AND d.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
          AND d.refobjid = t.oid AND d.refobjsubid = 1 AND d.deptype = 'a')
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger g
          WHERE g.tgrelid = t.oid AND NOT g.tgisinternal)
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite r WHERE r.ev_class = t.oid)
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid = t.oid)
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i
          WHERE i.inhrelid = t.oid OR i.inhparent = t.oid)
      FROM tab t CROSS JOIN seq s) AS table_shape_ok
  `;
  const row = rows[0];
  if (!validProbe(row) || row.schema_count < 0 || row.table_count < 0 || row.sequence_count < 0)
    reject('MIGRATION_LEDGER_CATALOG_REJECTED');
  if (row.schema_count === 0) {
    if (row.table_count || row.sequence_count) reject('MIGRATION_LEDGER_CATALOG_REJECTED');
    return 'schema_absent';
  }
  if (row.schema_count !== 1) reject('MIGRATION_LEDGER_CATALOG_REJECTED');
  if (row.schema_owner_ok !== true) reject('MIGRATION_LEDGER_OWNER_REJECTED');
  if (row.schema_acl_ok !== true) reject('MIGRATION_LEDGER_ACL_REJECTED');
  if (row.table_count === 0 && row.sequence_count === 0) return 'table_absent';
  if (row.table_count !== 1 || row.sequence_count !== 1) reject('MIGRATION_LEDGER_SHAPE_REJECTED');
  if (row.table_owner_ok !== true || row.sequence_owner_ok !== true)
    reject('MIGRATION_LEDGER_OWNER_REJECTED');
  if (row.table_acl_ok !== true || row.sequence_acl_ok !== true)
    reject('MIGRATION_LEDGER_ACL_REJECTED');
  if (row.table_shape_ok !== true) reject('MIGRATION_LEDGER_SHAPE_REJECTED');
  return 'table_present';
}

export async function readMigrationLedgerRows(sql: LedgerSql): Promise<readonly LedgerRow[]> {
  return sql<LedgerRow[]>`
    SELECT id::text AS id,
      CASE WHEN octet_length(hash) = 64 THEN hash ELSE NULL END AS hash,
      created_at::text AS created_at
    FROM "drizzle"."__drizzle_migrations" AS ledger
    ORDER BY ledger.id ASC
    LIMIT 94
  `;
}
