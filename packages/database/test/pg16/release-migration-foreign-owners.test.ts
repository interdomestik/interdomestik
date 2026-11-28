import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { sha256 } from '../../src/release-migrations';
import { insertClaim, seedActors } from '../claim-correspondence.fixture';
import { migrateJournalThrough } from '../journal-prefix.support';
import { insertPath } from '../storage-path-canonical.test-support';
import {
  createRuntimeLogin,
  proveRuntimeDenials,
  withCapabilityDatabase,
  withForeignOwnerCluster,
} from './release-foreign-owner-cluster.fixture';
import { proveDrift } from './release-foreign-owner-drift.fixture';
import {
  assert0115,
  assertCatalog,
  attempts,
  candidate,
  codes,
  dedicated,
  enrolledOwner,
  guard,
  lock,
  lockDefinition,
  memberships,
  presentRoles,
  publicCatalogSnapshot,
  refuseExpandUnchanged,
  repin,
  restoreEarlyCatalog,
  signatures,
  tag0114,
  to0113,
  verifyRecovery,
} from './release-foreign-owner.fixture';
import { assertLedger, assertRefusal } from './release-migration-fixture';
import { folder, makeJournal } from './release-migration-journal.fixture';

test('PG16 real release CLI enforces the seven 0114 function owners', async t => {
  await withForeignOwnerCluster(async () => {
    await t.test(
      'superuser creator admits the exact 0114–0115 suffix and preserves 0113 recovery',
      async caseTest => {
        const { dir } = candidate(caseTest);
        await withCapabilityDatabase({ t: caseTest, dir }, async (client, fixture) => {
          assert.equal(
            fixture.journal.entries[114].hash,
            'd0516c13878ef0be2ba4a3ba46580bd49bbd24c05b18a65a329633886a5e9336'
          );
          const original = await to0113(client, fixture);
          const bytes = readFileSync(original.RELEASE_PHASE_MANIFEST);
          await verifyRecovery(fixture, original);
          assert.deepEqual(await presentRoles(client), []);
          const runtimeUrl = await createRuntimeLogin(client);
          const suffix = await fixture.expand();
          assert.equal(suffix.expandCount, 116);
          await assertLedger(client, fixture.journal, 116);
          await assertCatalog(client);
          await assert0115(client);
          assert.deepEqual(await memberships(client), []);
          assert.deepEqual(readFileSync(original.RELEASE_PHASE_MANIFEST), bytes);
          const before = await publicCatalogSnapshot(client);
          const priorAttempts = await attempts(client);
          const repeat = await fixture.run('expand');
          assert.equal(repeat.code, 0, repeat.stderr);
          assert.equal(JSON.parse(repeat.stdout).plan.beforeCount, 116);
          assert.equal(JSON.parse(repeat.stdout).plan.expandCount, 116);
          assert.deepEqual(await publicCatalogSnapshot(client), before);
          assertRefusal(await fixture.run('recover', original), 'RECOVERY_LEDGER_MISMATCH');
          await assertLedger(client, fixture.journal, 116);
          assert.deepEqual(await publicCatalogSnapshot(client), before);
          assert.deepEqual(await attempts(client), priorAttempts);
          await proveRuntimeDenials(runtimeUrl);
        });
      }
    );

    await t.test(
      'demoted CREATEROLE login admits just the bootstrap admin-only creator edges',
      async caseTest => {
        const { dir } = candidate(caseTest);
        await withCapabilityDatabase({ t: caseTest, dir }, async (client, fixture) => {
          await to0113(client, fixture);
          assert.deepEqual(await presentRoles(client), []);
          const owner = await enrolledOwner(client);
          await client.unsafe(`ALTER ROLE ${owner} NOSUPERUSER CREATEROLE`);
          writeFileSync(
            fixture.files('config.json'),
            JSON.stringify({ ...fixture.config, expectedRolsuper: false })
          );
          assert.equal((await fixture.expand()).expandCount, 116);
          await assertLedger(client, fixture.journal, 116);
          await assertCatalog(client);
          await assert0115(client);
          assert.deepEqual(
            await memberships(client),
            dedicated.map(role => ({
              owner: role,
              member: owner.slice(1, -1),
              grantor: 10,
              admin: true,
              inherit: false,
              can_set: false,
            }))
          );
        });
      }
    );

    await t.test(
      'catalog drift is refused on an otherwise valid applied suffix',
      async caseTest => {
        const { dir } = candidate(caseTest);
        await withCapabilityDatabase({ t: caseTest, dir }, async (client, fixture) => {
          const original = await to0113(client, fixture);
          await fixture.expand();
          await proveDrift(caseTest, client, fixture, original);
        });
      }
    );

    await t.test(
      'a structurally exact 0114 catalog before its genuine ledger row is refused',
      async caseTest => {
        const { dir } = candidate(caseTest);
        await withCapabilityDatabase({ t: caseTest, dir }, async (client, fixture) => {
          const original = await to0113(client, fixture);
          for (const role of dedicated)
            await client.unsafe(`CREATE ROLE ${role} NOLOGIN NOINHERIT NOBYPASSRLS`);
          await verifyRecovery(fixture, original);
          await restoreEarlyCatalog(client);
          await assertCatalog(client);
          await refuseExpandUnchanged(client, fixture, codes.ledger, 114);
        });
      }
    );

    for (const [name, removed] of [
      ['partial', [lock]],
      ['absent', signatures],
    ] as const) {
      await t.test(
        `a genuinely applied 0114 prefix refuses a ${name} identity set`,
        async caseTest => {
          const { dir } = candidate(caseTest, 114);
          await withCapabilityDatabase({ t: caseTest, dir }, async (client, fixture) => {
            await to0113(client, fixture);
            assert.equal((await fixture.expand()).expandCount, 115);
            await assertLedger(client, fixture.journal, 115);
            await assertCatalog(client);
            for (const signature of removed)
              await client.unsafe(`DROP FUNCTION ${signature} CASCADE`);
            const [remaining] = await client`SELECT count(to_regprocedure(signature))::int AS count
            FROM unnest(${client.array(signatures)}::text[]) signature`;
            assert.equal(remaining.count, signatures.length - removed.length);
            await refuseExpandUnchanged(client, fixture, codes.ledger, 115);
          });
        }
      );
    }

    await t.test(
      'a scratch-pinned candidate with different 0114 bytes refuses before migration SQL',
      async caseTest => {
        const { dir } = candidate(caseTest);
        await withCapabilityDatabase({ t: caseTest, dir }, async (client, fixture) => {
          const original = await to0113(client, fixture);
          await verifyRecovery(fixture, original);
          const file = join(dir, `${tag0114}.sql`);
          const bytes = readFileSync(file);
          // If the altered entry runs, the CLI reports MIGRATION_SQL_FAILED instead.
          appendFileSync(file, '\n--> statement-breakpoint\nSELECT 1 / 0;\n');
          assert.notEqual(sha256(readFileSync(file)), fixture.journal.entries[114].hash);
          repin(fixture, dir);
          const inspection = await fixture.run('inspect');
          assert.equal(inspection.code, 0, inspection.stderr);
          assert.notEqual(JSON.parse(inspection.stdout).ledgerSha256, fixture.journal.ledgerSha256);
          await refuseExpandUnchanged(client, fixture, codes.ledger, 114);
          assert.deepEqual(await presentRoles(client), []);
          writeFileSync(file, bytes);
          repin(fixture, dir);
          await verifyRecovery(fixture, original);
        });
      }
    );

    await t.test(
      'final expand inspection rolls back the entire suffix and permits a corrected retry',
      async caseTest => {
        const { dir, entries, writeJournal } = candidate(caseTest);
        await withCapabilityDatabase({ t: caseTest, dir }, async (client, fixture) => {
          const original = await to0113(client, fixture);
          const tail = '0116_scratch_definition_drift';
          const tailFile = join(dir, `${tail}.sql`);
          writeFileSync(tailFile, `ALTER FUNCTION ${lock} COST 101`);
          writeJournal([
            ...entries,
            { ...entries[115], idx: 116, tag: tail, when: entries[115].when + 1 },
          ]);
          repin(fixture, dir);
          assert.deepEqual(await presentRoles(client), []);
          await refuseExpandUnchanged(client, fixture, codes.definition, 114);
          assert.deepEqual(await presentRoles(client), []);
          assert.deepEqual(await memberships(client), []);
          rmSync(tailFile);
          writeJournal();
          repin(fixture, dir);
          await verifyRecovery(fixture, original);
          assert.equal((await fixture.expand()).expandCount, 116);
          await assertLedger(client, fixture.journal, 116);
          await assertCatalog(client);
          await assert0115(client);
        });
      }
    );

    await t.test(
      'a presuffix 0113 approval stays spent after its post-reservation prefix refusal',
      async caseTest => {
        const { dir } = candidate(caseTest);
        await withCapabilityDatabase({ t: caseTest, dir }, async (client, fixture) => {
          assert.equal((await fixture.expand()).expandCount, 113);
          await assertLedger(client, fixture.journal, 113);
          await client`CREATE ROLE interdomestik_wp12_guard NOLOGIN NOINHERIT NOBYPASSRLS`;
          await client.unsafe(lockDefinition());
          await client.unsafe(`ALTER FUNCTION ${lock} OWNER TO ${guard}`);
          const before = await publicCatalogSnapshot(client);
          const approval = fixture.approval();
          assert.deepEqual(await attempts(client), []);
          assertRefusal(await fixture.run('contract', approval), codes.ledger);
          assert.deepEqual(await attempts(client), [{ nonce: approval.RELEASE_PHASE_ATTEMPT }]);
          assertRefusal(await fixture.run('contract', approval), 'RECEIPT_REPLAYED');
          await assertLedger(client, fixture.journal, 113);
          assert.deepEqual(await attempts(client), [{ nonce: approval.RELEASE_PHASE_ATTEMPT }]);
          assert.deepEqual(await publicCatalogSnapshot(client), before);
        });
      }
    );

    await t.test(
      'post-SQL contract inspection rolls back early identities while the approval stays spent',
      async caseTest => {
        const input = makeJournal(caseTest, {
          contract: `ALTER TABLE writer DROP COLUMN legacy;
  --> statement-breakpoint
  CREATE ROLE ${guard} NOLOGIN NOINHERIT NOBYPASSRLS;
  --> statement-breakpoint
  ${lockDefinition()}
  --> statement-breakpoint
  ALTER FUNCTION ${lock} OWNER TO ${guard};`,
        });
        await withCapabilityDatabase({ t: caseTest, ...input }, async (client, fixture) => {
          assert.equal((await fixture.expand()).expandCount, 2);
          const before = await publicCatalogSnapshot(client);
          const approval = fixture.approval();
          assertRefusal(await fixture.run('contract', approval), codes.ledger);
          await assertLedger(client, fixture.journal, 2);
          assert.deepEqual(await publicCatalogSnapshot(client), before);
          assert.deepEqual(await presentRoles(client), []);
          assert.deepEqual(await memberships(client), []);
          assert.deepEqual(await attempts(client), [{ nonce: approval.RELEASE_PHASE_ATTEMPT }]);
          assertRefusal(await fixture.run('contract', approval), 'RECEIPT_REPLAYED');
          assertRefusal(await fixture.run('recover'), 'RECOVERY_AT_EXPAND');
        });
      }
    );
    await t.test('0110 atomically rejects an invalid legacy path and retries', async caseTest => {
      await withCapabilityDatabase(
        {
          t: caseTest,
          dir: candidate(caseTest).dir,
          prepare: runner =>
            migrateJournalThrough(runner, folder, '0109_wp19_claim_documents_access_claim_id'),
        },
        async (client, fixture) => {
          await assertLedger(client, fixture.journal, 110);
          await seedActors(client);
          const claim = await insertClaim(client);
          const id = await insertPath(client, 'claim_documents', claim, '/legacy');
          const row = () => client`SELECT file_path, xmin::text AS row_version
            FROM public.claim_documents WHERE id = ${id}`;
          const before = await row();
          assert.equal(before[0]?.file_path, '/legacy');
          await refuseExpandUnchanged(client, fixture, 'MIGRATION_SQL_FAILED', 110);
          assert.deepEqual(await row(), before);
          const replaced = await client`
            WITH removed AS (DELETE FROM public.claim_documents WHERE id = ${id} RETURNING claim_documents)
            INSERT INTO public.claim_documents
            SELECT (jsonb_populate_record(claim_documents, '{"file_path": "legacy"}')).* FROM removed
          `;
          assert.equal(replaced.count, 1);
          assert.equal((await fixture.expand()).expand.tag, '0112_wp07_rate_check_expand');
          await assertLedger(client, fixture.journal, 113);
        }
      );
    });
  });
});
