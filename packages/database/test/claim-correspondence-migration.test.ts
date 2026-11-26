import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assignedPath,
  documentInput,
  insertClaim,
  insertDocument,
  restricted,
  seedActors,
  withRuntime,
  type Connection,
} from './claim-correspondence.fixture';
import {
  migrateJournal,
  scratchServerMissing,
  withScratchDatabase,
  type ScratchClient,
} from './pg16/scratch-database';

const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));
// Resolved from the journal so the migration stays renumberable.
const registerTagSuffix = '_wp12_claim_correspondence';

const randomPath = () => randomBytes(3_000).toString('base64url');
const nearLimitId = () => `d${randomPath().slice(0, 2_649)}`;

test('WP-12 journal cutover preserves legacy cases and closes intake', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  await withScratchDatabase('wp12_legacy', async admin => {
    const legacy = await proveJournal(t, admin);
    await withRuntime(admin, connections => proveIntake(t, connections, legacy));
  });
});

function journalThrough(t: TestContext, stop: 'prior' | 'register' | 'before-inbound') {
  const journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8'));
  const register = journal.entries.findIndex((entry: { tag: string }) =>
    entry.tag.endsWith(registerTagSuffix)
  );
  assert.ok(register > 0, 'the WP-12 register migration follows an earlier journal entry');
  const inbound = journal.entries.findIndex((entry: { tag: string }) =>
    entry.tag.endsWith('_wp12_1_inbound_documents')
  );
  assert.ok(inbound > register, 'the pilot migration follows the case register');
  const index =
    stop === 'before-inbound' ? inbound - 1 : stop === 'register' ? register : register - 1;
  const entries: { tag: string }[] = journal.entries.slice(0, index + 1);
  const dir = mkdtempSync(join(tmpdir(), 'wp12-journal-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'meta'));
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const { tag } of entries)
    copyFileSync(join(migrations, `${tag}.sql`), join(dir, `${tag}.sql`));
  return dir;
}

async function proveInboundOccupancy(
  admin: ScratchClient,
  claim: Awaited<ReturnType<typeof insertClaim>>
) {
  const reservedId = 'wp12-inbound-' + 'a'.repeat(32);
  const checkOccupancy = () =>
    assert.rejects(migrateJournal(admin, migrations), (error: unknown) => {
      assert.ok(error instanceof Error);
      const driver = error.cause ?? error;
      assert.ok(driver instanceof Error && 'code' in driver);
      assert.equal(driver.code, 'P0001');
      assert.equal(driver.message, 'WP-12.1 document namespace is already occupied');
      return true;
    });
  const ordinary = documentInput(
    claim,
    randomUUID(),
    assignedPath(claim, reservedId) + '#fragment'
  );
  await insertDocument(admin, ordinary);
  await checkOccupancy();
  await admin`delete from claim_documents where id = ${ordinary.id}`;

  const polymorphicId = randomUUID();
  const encoded = assignedPath(claim, reservedId.replace('w', '%77'));
  await admin`insert into documents (id, tenant_id, entity_type, entity_id, file_name, storage_path, uploaded_by, deleted_at)
    values (${polymorphicId}, ${claim.tenant}, 'claim', ${claim.id}, 'Fixture PDF', ${encoded}, ${claim.user}, now())`;
  await checkOccupancy();
  await admin`delete from documents where id = ${polymorphicId}`;
}

async function proveJournal(t: TestContext, admin: ScratchClient) {
  await migrateJournal(admin, journalThrough(t, 'prior'));
  const [claimKey] = await admin`
    select pg_get_indexdef(to_regclass('public.claim_tenant_id_id_uq')) as definition`;
  assert.equal(
    claimKey?.definition,
    'CREATE UNIQUE INDEX claim_tenant_id_id_uq ON public.claim USING btree (tenant_id, id)',
    'the composite claim key is available before the WP-12 foreign keys are installed'
  );
  await seedActors(admin);
  const retail = await insertClaim(admin, { id: 'l1', category: 'retail' });
  const injury = await insertClaim(admin, {
    id: 'l2',
    category: 'Personal Injury',
    lifecycle: 'resolved',
  });
  const draft = await insertClaim(admin, { id: 'l3', category: 'other', lifecycle: 'draft' });
  const closedDrafts = [];
  for (const category of ['injury', 'invalidity', 'Personal Injury']) {
    closedDrafts.push(await insertClaim(admin, { category, lifecycle: 'draft' }));
  }
  const ids = [retail.id, injury.id, draft.id, ...closedDrafts.map(claim => claim.id)];
  const documents = [
    documentInput(retail),
    documentInput(retail, undefined, randomPath()),
    documentInput(injury, nearLimitId()),
  ];
  const duplicateLegacyPath = documentInput(injury, undefined, documents[0].file_path);
  for (const document of [...documents, duplicateLegacyPath]) {
    await admin`insert into claim_documents ${admin(document)}`;
  }
  assert.ok(documents[1].file_path.length > 3_000);
  assert.equal(documents[2].id.length, 2_650);
  const documentIds = [...documents, duplicateLegacyPath].map(document => document.id);
  // Row values and row versions (xmin): the migration performs no DML on an existing table.
  const snapshot = async () => ({
    claims: [
      ...(await admin`select xmin::text as version, to_jsonb(c) as row
        from claim c where id in ${admin(ids)} order by id`),
    ],
    documents: [
      ...(await admin`select xmin::text as version, to_jsonb(d) as row
        from claim_documents d where id in ${admin(documentIds)} order by id`),
    ],
  });
  const before = await snapshot();
  assert.equal(before.claims.length, ids.length);
  assert.equal(before.documents.length, documentIds.length);

  await migrateJournal(admin, journalThrough(t, 'register'));
  assert.deepEqual(
    await snapshot(),
    before,
    'the migration leaves legacy claims and documents untouched'
  );
  await migrateJournal(admin, journalThrough(t, 'before-inbound'));
  await proveInboundOccupancy(admin, retail);
  await migrateJournal(admin, migrations);
  assert.deepEqual(
    await snapshot(),
    before,
    'WP-12.1 keeps duplicate and long legacy paths intact'
  );
  const [pilot] = await admin`select count(*)::int as count from claim_inbound_pilot_cases`;
  assert.equal(pilot.count, 0);
  return { retail, injury, draft, closedDrafts };
}

async function proveIntake(
  t: TestContext,
  { runtime }: Connection,
  { retail, injury, draft, closedDrafts }: Awaited<ReturnType<typeof proveJournal>>
) {
  await t.test(
    'direct intake rejects every closed or free-text category and preserves existing cases',
    async () => {
      for (const category of ['injury', 'invalidity', 'Personal Injury']) {
        for (const lifecycle of ['draft', 'submitted'] as const) {
          await assert.rejects(
            restricted(runtime, tx => insertClaim(tx, { category, lifecycle })),
            { code: 'P1204', message: 'The claim category is closed for intake' }
          );
        }
        await assert.rejects(
          restricted(runtime, async tx => {
            await tx`update claim set category = ${category} where id = ${retail.id}`;
          }),
          { code: 'P1204', message: 'The claim category is closed for intake' }
        );
      }
      await restricted(runtime, async tx => {
        const [changed] = await tx`
        update claim set case_lifecycle_state = 'verification' where id = ${retail.id} returning category`;
        assert.equal(changed.category, 'retail');
        const [updated] = await tx`
        update claim set title = 'Legacy case title edited' where id = ${injury.id} returning category, title`;
        assert.deepEqual(updated, {
          category: 'Personal Injury',
          title: 'Legacy case title edited',
        });
      });
      for (const claim of [draft, ...closedDrafts]) {
        await assert.rejects(
          restricted(runtime, async tx => {
            await tx`update claim set case_lifecycle_state = 'submitted' where id = ${claim.id}`;
          }),
          { code: 'P1204', message: 'The claim category is closed for intake' }
        );
      }
      await restricted(runtime, async tx => {
        const [corrected] =
          await tx`update claim set category = 'vehicle' where id = ${draft.id} returning category`;
        assert.equal(corrected.category, 'vehicle');
        const [submitted] = await tx`
        update claim set case_lifecycle_state = 'submitted' where id = ${draft.id} returning case_lifecycle_state`;
        assert.equal(submitted.case_lifecycle_state, 'submitted');
      });
    }
  );
}
