import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const databaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(databaseRoot, relativePath), 'utf8');
}

test('C13 migration and schema preserve the exact free-start draft boundary', async () => {
  const [schema, schemaIndex, migration, journalText, snapshotText] = await Promise.all([
    source('src/schema/free-start-drafts.ts'),
    source('src/schema/index.ts'),
    source('drizzle/0092_ida_free_start_drafts.sql'),
    source('drizzle/meta/_journal.json'),
    source('drizzle/meta/0092_snapshot.json'),
  ]);

  assert.match(schema, /pgTable\(\s*'free_start_drafts'/);
  assert.match(schemaIndex, /export \* from '\.\/free-start-drafts';/);
  assert.match(migration, /CREATE TABLE "free_start_drafts"/);
  for (const column of [
    'tenant_id',
    'access_tenant_id',
    'owner_user_id',
    'client_request_id',
    'category',
    'issue_type',
    'incident_date',
    'counterparty',
    'desired_outcome',
    'summary',
    'resume_step',
    'version',
    'created_at',
    'updated_at',
  ]) {
    assert.match(migration, new RegExp(`"${column}"`), `missing ${column}`);
  }

  assert.match(migration, /"free_start_drafts_owner_user_id_user_id_fk"[\s\S]*"user"\("id"\)/);
  assert.doesNotMatch(
    migration.match(/free_start_drafts_owner_user_id_user_id_fk[^;]+;/)?.[0] ?? '',
    /cascade/i
  );
  assert.match(
    migration,
    /CHECK \("free_start_drafts"\."tenant_id" = "free_start_drafts"\."access_tenant_id"\)/
  );
  assert.match(migration, /free_start_drafts_issue_matrix_check/);
  assert.match(migration, /free_start_drafts_version_check/);
  assert.match(migration, /free_start_drafts_owner_request_uq/);
  assert.match(migration, /free_start_drafts_owner_updated_idx/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /current_setting\('app\.current_access_tenant_id', true\)/);
  assert.match(migration, /current_setting\('app\.current_actor_id', true\)/);
  assert.match(migration, /FOR ALL[\s\S]*USING[\s\S]*WITH CHECK/);

  for (const forbidden of ['email', 'otp', 'session_token', 'ip_address', 'health', 'upload']) {
    assert.doesNotMatch(schema, new RegExp(`['"]${forbidden}['"]`, 'i'));
  }

  const journal = JSON.parse(journalText) as { entries: Array<{ idx: number; tag: string }> };
  assert.deepEqual(
    journal.entries.find(entry => entry.idx === 92),
    {
      idx: 92,
      version: '7',
      when: 1784332800000,
      tag: '0092_ida_free_start_drafts',
      breakpoints: true,
    }
  );
  const snapshot = JSON.parse(snapshotText) as { tables: Record<string, unknown> };
  assert.ok(snapshot.tables['public.free_start_drafts']);
});
