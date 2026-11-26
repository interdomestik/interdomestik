import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { insertClaim, seedActors } from './claim-correspondence.fixture';
import { migrateJournalThrough } from './journal-prefix.support';
import { migrateJournal, scratchServerMissing, type ScratchClient } from './pg16/scratch-database';
import {
  constraints,
  insertPath,
  migrations,
  pathViolation,
  tables,
  withStorageScratch,
} from './storage-path-canonical.test-support';

async function beforeStorageChecks(admin: ScratchClient) {
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  );
  const index = journal.entries.findIndex(entry => entry.tag.endsWith('_storage_path_canonical'));
  assert.ok(index > 0, 'storage-check migration follows its journal predecessor');
  await migrateJournalThrough(admin, migrations, journal.entries[index - 1].tag);
  await seedActors(admin);
  return insertClaim(admin);
}

async function snapshot(admin: ScratchClient) {
  return await admin`
    select 'claim_documents' as source, xmin::text as row_version, to_jsonb(c) as row
    from public.claim_documents c
    union all
    select 'documents', xmin::text, to_jsonb(d) from public.documents d
    order by source`;
}

test('storage path migration preserves populated canonical rows', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  await withStorageScratch('storage_paths_cutover', async admin => {
    const claim = await beforeStorageChecks(admin);
    await insertPath(admin, 'claim_documents', claim, 'legacy/.hidden/AbZ09_-');
    await insertPath(admin, 'documents', claim, 'legacy/A.b/policy.');
    const before = await snapshot(admin);
    assert.equal(before.length, 2);
    await migrateJournal(admin, migrations);
    assert.deepEqual(await snapshot(admin), before);
    const checks = await admin`
      select conname::text as name from pg_constraint
      where convalidated and contype = 'c'
        and conname in ${admin(Object.values(constraints))}
      order by conname`;
    assert.deepEqual(
      checks.map(row => row.name),
      Object.values(constraints)
    );
  });
});

for (const table of tables) {
  test(`storage path migration rolls back when ${table} holds an incompatible row`, async t => {
    const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
    if (missing) return t.skip(missing);
    await withStorageScratch('storage_paths_refusal', async admin => {
      const claim = await beforeStorageChecks(admin);
      await insertPath(
        admin,
        'claim_documents',
        claim,
        table === 'claim_documents' ? '/legacy' : 'legacy/claim'
      );
      await insertPath(
        admin,
        'documents',
        claim,
        table === 'documents' ? '/legacy' : 'legacy/document'
      );
      const before = await snapshot(admin);
      const beforeJournal =
        await admin`select count(*)::int as size from drizzle.__drizzle_migrations`;
      await assert.rejects(migrateJournal(admin, migrations), pathViolation(table));
      assert.deepEqual(await snapshot(admin), before);
      assert.deepEqual(
        await admin`select count(*)::int as size from drizzle.__drizzle_migrations`,
        beforeJournal
      );
      const checks = await admin`
        select conname from pg_constraint where conname in ${admin(Object.values(constraints))}`;
      assert.equal(checks.length, 0);
    });
  });
}
