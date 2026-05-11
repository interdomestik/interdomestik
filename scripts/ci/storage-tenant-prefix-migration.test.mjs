import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/00009_storage_tenant_prefix_backstop.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');

test('SEC06 migration has a legacy-object preflight', () => {
  assert.match(sql, /SEC06 storage preflight failed/);
  assert.match(sql, /bucket_id = 'claim-evidence'[\s\S]+name LIKE 'pii\/claims\/%'/);
  assert.match(sql, /bucket_id = 'policies'[\s\S]+name LIKE 'pii\/policies\/%'/);
});

test('SEC06 migration derives tenant id through a security-definer helper', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.current_tenant_id\(\)/);
  assert.match(sql, /LANGUAGE plpgsql/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /actor_id := \(SELECT auth\.uid\(\)\)::text/);
  assert.match(sql, /to_regclass\('public\."user"'\) IS NULL/);
  assert.match(sql, /RETURN NULL/);
  assert.match(
    sql,
    /EXECUTE 'SELECT u\.tenant_id FROM public\."user" AS u WHERE u\.id = \$1 LIMIT 1'/
  );
  assert.match(sql, /USING actor_id/);
  assert.match(sql, /RETURN tenant_id;\s+END;\s+\$\$;/);
});

test('SEC06 migration replaces legacy policies with tenant-prefix folder policies', () => {
  assert.match(sql, /DROP POLICY IF EXISTS "Members can insert own evidence objects"/);
  assert.match(sql, /DROP POLICY IF EXISTS "Members can insert own policy objects"/);
  assert.match(sql, /\(storage\.foldername\(name\)\)\[1\] = 'pii'/);
  assert.match(sql, /\(storage\.foldername\(name\)\)\[2\] = 'tenants'/);
  assert.match(
    sql,
    /\(storage\.foldername\(name\)\)\[3\] = \(SELECT private\.current_tenant_id\(\)\)/
  );
  assert.match(sql, /\(storage\.foldername\(name\)\)\[4\] = 'claims'/);
  assert.match(sql, /\(storage\.foldername\(name\)\)\[4\] = 'policies'/);
});
