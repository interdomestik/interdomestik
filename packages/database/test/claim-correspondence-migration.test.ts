import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  documentInput,
  insertClaim,
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

function journalThrough(t: TestContext, stop: 'prior' | 'register') {
  const journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8'));
  const register = journal.entries.findIndex((entry: { tag: string }) =>
    entry.tag.endsWith(registerTagSuffix)
  );
  assert.ok(register > 0, 'the WP-12 register migration follows an earlier journal entry');
  const index = stop === 'register' ? register : register - 1;
  const entries: { tag: string }[] = journal.entries.slice(0, index + 1);
  const dir = mkdtempSync(join(tmpdir(), 'wp12-journal-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'meta'));
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const { tag } of entries)
    copyFileSync(join(migrations, `${tag}.sql`), join(dir, `${tag}.sql`));
  return dir;
}

async function proveJournal(t: TestContext, admin: ScratchClient) {
  await migrateJournal(admin, journalThrough(t, 'prior'));
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
  const before =
    await admin`select to_jsonb(c) as row from claim c where id in ${admin(ids)} order by id`;
  const documents = [
    documentInput(retail),
    documentInput(retail, undefined, randomPath()),
    documentInput(injury, nearLimitId()),
  ];
  for (const document of documents) await admin`insert into claim_documents ${admin(document)}`;
  assert.ok(documents[1].file_path.length > 3_000);
  assert.equal(documents[2].id.length, 2_650);

  await migrateJournal(admin, journalThrough(t, 'register'));
  const after = await admin`
    select to_jsonb(c) - array['other_vehicle_country_code', 'insurance_proof_reference',
      'outside_handling_party', 'coverage_verification_status', 'case_follow_up_at'] as row
      from claim c where id in ${admin(ids)} order by id`;
  assert.deepEqual([...after], [...before], 'the migration leaves legacy claims unchanged');
  const refs = await admin<{ id: string; stored: string; computed: string }[]>`
    select id, citation_ref as stored,
      claim_document_citation_ref(tenant_id, claim_id, id, bucket, file_path) as computed
    from claim_documents where id in ${admin(documents.map(doc => doc.id))}`;
  assert.equal(refs.length, documents.length);
  for (const document of documents) {
    const row = refs.find(row => row.id === document.id);
    assert.ok(row?.stored);
    assert.equal(row.stored, row.computed);
  }
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
