import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import postgres from 'postgres';

import {
  childRows,
  documentKey,
  evidenceTables,
  homeKey,
  insertChild,
  migrations,
  storedChild,
  withEvidenceDocument,
  type ChildTable,
} from './case-tenant-binding.fixture';
import {
  documentInput,
  foreignTenant,
  insertClaim,
  insertDocument,
  seedActors,
} from './claim-correspondence.fixture';
import { migrateJournalThrough } from './journal-prefix.support';
import { migrateJournal, scratchServerMissing, withScratchDatabase } from './pg16/scratch-database';

function migrationForeignKeyViolation(constraintName: string) {
  return (error: unknown) => {
    assert.ok(error instanceof Error && error.cause instanceof postgres.PostgresError);
    assert.equal(error.cause.code, '23503');
    assert.equal(error.cause.constraint_name, constraintName);
    return true;
  };
}

test('case-tenant binding validates a populated upgrade atomically', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  );
  const index = journal.entries.findIndex(entry => entry.tag.endsWith('_case_tenant_binding'));
  assert.ok(index > 0, 'the binding migration has a journaled predecessor');

  await withScratchDatabase('case_binding_upgrade', async admin => {
    await migrateJournalThrough(admin, migrations, journal.entries[index - 1].tag);
    await seedActors(admin);
    const homeCase = await insertClaim(admin);
    const foreignCase = await insertClaim(admin, { tenant: foreignTenant });
    const document = await insertDocument(admin, documentInput(homeCase));
    const valid = withEvidenceDocument(homeCase, document.id);
    const tables = Object.keys(valid) as ChildTable[];
    for (const table of tables) await insertChild(admin, table, valid[table]);

    const snapshot = () =>
      Promise.all(tables.map(table => storedChild(admin, table, valid[table].id)));
    const before = await snapshot();
    assert.ok(before.every(Boolean), 'each table contains a valid legacy row');
    const ledger = () => admin`
      select count(*)::int as size, max(created_at) as last
      from drizzle.__drizzle_migrations`;
    const beforeJournal = [...(await ledger())];
    const names = [...tables.map(homeKey), ...evidenceTables.map(documentKey)];
    const keys = () => admin`
      select c.conname::text as name, c.convalidated as validated, i.relname::text as parent_index
      from pg_constraint c join pg_class i on i.oid = c.conindid
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and c.conname in ${admin(names)}
      order by c.conname::text collate "C"`;
    const assertRolledBack = async () => {
      assert.equal((await keys()).length, 0);
      assert.deepEqual([...(await ledger())], beforeJournal);
      assert.deepEqual(await snapshot(), before);
    };

    await t.test(
      'rejects a wrong-home consent even when its legacy document triple matches',
      async () => {
        // Both rows are valid under the predecessor's ID-only FKs. The consent's
        // document triple matches, so its case FK is the first validation error.
        const driftedCase = { ...foreignCase, id: homeCase.id };
        const legacyDocument = await insertDocument(admin, documentInput(driftedCase));
        const table = 'claim_document_ai_extraction_consents';
        const wrong = childRows(driftedCase, legacyDocument.id)[table];
        await insertChild(admin, table, wrong);
        const original = await storedChild(admin, table, wrong.id);
        await assert.rejects(
          migrateJournal(admin, migrations),
          migrationForeignKeyViolation(homeKey(table))
        );
        await assertRolledBack();
        assert.deepEqual(await storedChild(admin, table, wrong.id), original);
        await admin`delete from public.claim_document_ai_extraction_consents where id = ${wrong.id}`;
        await admin`delete from public.claim_documents where id = ${legacyDocument.id}`;
      }
    );

    for (const table of evidenceTables) {
      await t.test(`rejects a legacy wrong-case document on ${table}`, async () => {
        const otherHomeCase = await insertClaim(admin);
        const wrong = withEvidenceDocument(otherHomeCase, document.id)[table];
        await insertChild(admin, table, wrong);
        const original = await storedChild(admin, table, wrong.id);
        await assert.rejects(
          migrateJournal(admin, migrations),
          migrationForeignKeyViolation(documentKey(table))
        );
        await assertRolledBack();
        assert.deepEqual(await storedChild(admin, table, wrong.id), original);
        await admin`delete from public.${admin(table)} where id = ${wrong.id}`;
      });
    }

    await migrateJournal(admin, migrations);
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(
      [...(await keys())],
      names.sort().map(name => ({
        name,
        validated: true,
        parent_index: name.endsWith('_case_home_fk')
          ? 'claim_tenant_id_id_uq'
          : 'claim_documents_tenant_claim_id_uq',
      }))
    );

    // The predecessor write shapes still commit with the new constraints in place.
    const nextDocument = await insertDocument(admin, documentInput(foreignCase));
    const next = withEvidenceDocument(foreignCase, nextDocument.id);
    for (const table of tables) {
      await insertChild(admin, table, next[table]);
      assert.ok(await storedChild(admin, table, next[table].id));
    }
  });
});
