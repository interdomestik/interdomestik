import { createHash } from 'node:crypto';
import type { MigrationExecutionSql } from './migration-execution-contracts';

export async function verifyBackend(sql: MigrationExecutionSql, expected: string) {
  const [shape] = await sql<{ valid: boolean }[]>`
    SELECT n.nspowner = r.oid AND c.relowner = r.oid
      AND c.relkind = 'r' AND c.relpersistence = 'p' AND NOT c.relispartition
      AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(n.nspacl) acl
        WHERE acl.grantee <> r.oid AND acl.privilege_type = 'CREATE'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(c.relacl) acl
        WHERE acl.grantee <> r.oid AND acl.privilege_type <> 'SELECT'
      ) AND (SELECT count(*) = 1 AND bool_and(a.attname = 'marker'
        AND a.atttypid = 'pg_catalog.text'::pg_catalog.regtype AND a.attnotnull
        AND a.attacl IS NULL AND a.attgenerated = '' AND a.attidentity = '')
        FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i
        WHERE i.inhrelid = c.oid OR i.inhparent = c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid = c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite w WHERE w.ev_class = c.oid)
      AS valid
    FROM pg_catalog.pg_namespace n
    JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
    JOIN pg_catalog.pg_roles r ON r.rolname = current_user
    WHERE n.nspname = 'runtime_attestation' AND c.relname = 'backend_marker'
  `;
  if (shape?.valid !== true) throw new Error('BACKEND_CATALOG_REJECTED');
  const markers = await sql<{ marker: string }[]>`
    SELECT marker FROM ONLY runtime_attestation.backend_marker LIMIT 2
  `;
  if (
    markers.length !== 1 ||
    createHash('sha256').update(markers[0].marker).digest('hex') !== expected
  )
    throw new Error('BACKEND_MISMATCH');
}

export async function inspectReleaseAttempts(sql: MigrationExecutionSql) {
  const [row] = await sql<{ valid: boolean }[]>`
    SELECT c.relowner = r.oid AND c.relkind = 'r' AND c.relpersistence = 'p'
      AND NOT c.relispartition AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(c.relacl) acl
        WHERE acl.grantee <> r.oid)
      AND (SELECT count(*) = 1 AND bool_and(a.attname = 'nonce' AND a.attnotnull
        AND a.atttypid = 'pg_catalog.text'::pg_catalog.regtype AND a.attacl IS NULL
        AND NOT a.atthasdef AND a.attgenerated = '' AND a.attidentity = '')
        FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0)
      AND (SELECT count(*) = 1 AND bool_and(k.contype = 'p' AND k.conkey = ARRAY[1]::smallint[]
        AND k.convalidated AND NOT k.condeferrable)
        FROM pg_catalog.pg_constraint k WHERE k.conrelid = c.oid)
      AND (SELECT count(*) = 1 AND bool_and(i.indisprimary AND i.indisunique AND i.indisvalid
        AND i.indislive AND i.indisready)
        FROM pg_catalog.pg_index i WHERE i.indrelid = c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i
        WHERE i.inhrelid = c.oid OR i.inhparent = c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid = c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite w WHERE w.ev_class = c.oid)
      AS valid
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_roles r ON r.rolname = current_user
    WHERE c.oid = pg_catalog.to_regclass('drizzle.__release_contract_attempts')
  `;
  if (row && row.valid !== true) throw new Error('ATTEMPT_CATALOG_REJECTED');
  return Boolean(row);
}

export async function consumeReleaseAttempt(sql: MigrationExecutionSql, nonce: string) {
  if (!(await inspectReleaseAttempts(sql))) {
    await sql`CREATE TABLE drizzle.__release_contract_attempts (nonce text PRIMARY KEY)`;
    if (!(await inspectReleaseAttempts(sql))) throw new Error('ATTEMPT_CATALOG_REJECTED');
  }
  const rows = await sql`
    INSERT INTO drizzle.__release_contract_attempts (nonce) VALUES (${nonce})
    ON CONFLICT DO NOTHING RETURNING nonce
  `;
  if (rows.length !== 1) throw new Error('RECEIPT_REPLAYED');
}
