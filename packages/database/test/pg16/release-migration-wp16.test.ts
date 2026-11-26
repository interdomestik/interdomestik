import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { sha256 } from '../../src/release-migrations';
import {
  inspectSponsorCheckpoint,
  sponsorRuntimeRole,
  sponsorTrailingTag,
} from '../../src/release-sponsor-checkpoint';
import type { SponsorExpandOptions } from '../../src/release-sponsor-expand';
import { assertLedger, assertRefusal, withReleaseDatabase } from './release-migration-fixture';
import { folder, policy, workspace } from './release-migration-journal.fixture';
import { prefix, stageJournal, withGrantsRole } from './wp16-1-runtime-grants.test-support';

type Fixture = Parameters<Parameters<typeof withReleaseDatabase>[2]>[1];
type EvidenceRecord = Parameters<SponsorExpandOptions['record']>[1] & { transactionId: string };

function candidateThrough0109(t: TestContext) {
  const dir = workspace(t);
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8'));
  const entries: { tag: string }[] = journal.entries.slice(0, 110);
  assert.equal(entries.at(-1)?.tag, '0109_wp19_claim_documents_access_claim_id');
  mkdirSync(join(dir, 'meta'));
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const { tag } of entries) copyFileSync(join(folder, `${tag}.sql`), join(dir, `${tag}.sql`));
  return dir;
}

async function expand(fixture: Fixture) {
  const result = await fixture.run();
  assert.equal(result.code, 0, result.stderr);
  const manifest = JSON.parse(result.stdout);
  assert.equal(manifest.status, 'expanded');
  const reference = manifest.sponsorEvidence;
  assert.ok(reference, 'Expand must reference the retained sponsor evidence');
  assert.match(reference.file, /^[a-f0-9]{64}\/sponsor-evidence\.jsonl$/u);
  const raw = readFileSync(join(fixture.config.attemptDirectory, reference.file), 'utf8');
  assert.equal(sha256(raw), reference.sha256);
  const records: EvidenceRecord[] = raw
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line));
  return { manifest, records };
}

async function expandWithTrailing(fixture: Fixture) {
  const { manifest, records } = await expand(fixture);
  const trailing = fixture.journal.entries.findIndex(entry => entry.tag === sponsorTrailingTag);
  const acl = records.filter(record => record.type === 'acl').map(record => record.evidence);
  const before = acl.find(record => record.phase === 'before-trailing');
  const after = acl.find(record => record.phase === 'after-trailing');
  assert.ok(before && after);
  assert.deepEqual(
    [before.target.ledger.length, after.target.ledger.length],
    [trailing, trailing + 1]
  );
  assert.equal(after.target.ledger.at(-1)?.hash, fixture.journal.entries[trailing].hash);
  return { manifest, records, before, after, trailing };
}

function assertCheckpoint(records: EvidenceRecord[]) {
  const checkpoint = records.filter(record => record.type === 'checkpoint');
  assert.deepEqual(
    checkpoint.map(record => record.evidence.phase),
    ['before-checkpoint', 'checkpoint-checked']
  );
  const [before, checked] = checkpoint;
  assert.equal(before.evidence.target.ledger.length, prefix);
  assert.equal(checked.evidence.target.ledger.length, prefix);
  assert.equal(before.evidence.checks.find(row => row.relation === 'claim')?.matches0105, false);
  assert.equal(checked.evidence.checks.length, 10);
  assert.ok(checked.evidence.checks.every(row => row.namedEffective && row.matches0105));
  assert.equal(before.evidence.attemptId, checked.evidence.attemptId);
  assert.ok(records.every(row => row.transactionId === checked.evidence.attemptId));
  return checked;
}

test('PG16 owner expand runs the WP-16.1 checkpoint and retains rollback evidence', async t => {
  await withGrantsRole(t, async () => {
    await t.test(
      'fresh target supplies missing 0105 grants at the verified checkpoint',
      async t => {
        await withReleaseDatabase(
          'interdomestik_admin_config_wp16_fresh',
          { t, dir: folder, registry: policy },
          async (client, fixture) => {
            const { manifest, records } = await expandWithTrailing(fixture);
            assert.equal(manifest.plan.beforeCount, 0);
            const checked = assertCheckpoint(records);
            const [{ status }] = await client`
            SELECT pg_catalog.pg_xact_status(${checked.transactionId}::text::xid8) AS status
          `;
            assert.equal(status, 'committed');
            await assertLedger(client, fixture.journal, manifest.plan.expandCount);
          }
        );
      }
    );

    await t.test('forward target retains the ACL on both sides of 0111', async t => {
      await withReleaseDatabase(
        'interdomestik_admin_config_wp16_forward',
        { t, dir: folder, registry: policy, prepare: runner => stageJournal(runner, 'legacy') },
        async (client, fixture) => {
          const { manifest, records, before, after, trailing } = await expandWithTrailing(fixture);
          assert.equal(manifest.plan.beforeCount, trailing);
          assert.deepEqual(
            records.filter(record => record.type === 'checkpoint'),
            []
          );
          const beforeClaim = before.acl.find(table => table.relation === 'claim');
          const afterClaim = after.acl.find(table => table.relation === 'claim');
          const beforeId = beforeClaim?.columns.find(column => column.name === 'id');
          const afterId = afterClaim?.columns.find(column => column.name === 'id');
          assert.ok(beforeId && afterId);
          assert.ok(beforeId.effective.includes('UPDATE'));
          assert.ok(!afterId.effective.includes('UPDATE'));
          assert.ok(beforeId.acl?.includes(`${sponsorRuntimeRole}=w/${before.target.owner}`));
          assert.ok(!afterId.acl?.includes(`${sponsorRuntimeRole}=`));
          const preExisting = beforeClaim?.columns.find(column => column.name === 'updatedAt');
          assert.ok(preExisting?.effective.includes('UPDATE'));
          assert.deepEqual(
            afterClaim?.columns.find(column => column.name === 'updatedAt'),
            preExisting
          );
          await assertLedger(client, fixture.journal, manifest.plan.expandCount);
        }
      );
    });

    const through0109 = candidateThrough0109(t);
    await t.test(
      '0109 candidate supplies missing 0105 grants at the verified checkpoint',
      async t => {
        await withReleaseDatabase(
          'interdomestik_admin_config_wp16_0109_missing',
          {
            t,
            dir: through0109,
            registry: policy,
            prepare: runner => stageJournal(runner, 'missing'),
          },
          async (client, fixture) => {
            const { manifest, records } = await expand(fixture);
            assert.equal(manifest.plan.beforeCount, prefix);
            assert.equal(manifest.plan.expandCount, 110);
            assertCheckpoint(records);
            assert.deepEqual(
              records.flatMap(record => (record.type === 'acl' ? [record.evidence.phase] : [])),
              ['before-checkpoint']
            );
            await assertLedger(client, fixture.journal, 110);
          }
        );
      }
    );

    for (const [candidate, dir, overbroadRelation] of [
      ['with 0111', folder, 'user'],
      // Granting UPDATE on claim fills the last privilege that 0105 checks.
      ['through 0109', through0109, 'claim'],
    ]) {
      const claimGranted = overbroadRelation === 'claim';
      await t.test(
        `an overbroad grant makes the checkpoint refuse and preserves the prefix (${candidate})`,
        async t => {
          await withReleaseDatabase(
            'interdomestik_admin_config_wp16_refusal',
            {
              t,
              dir,
              registry: policy,
              async prepare(runner) {
                await stageJournal(runner, 'missing');
                await runner`GRANT UPDATE ("updatedAt") ON public.${runner(overbroadRelation)}
                TO ${runner(sponsorRuntimeRole)} WITH GRANT OPTION`;
                const checks = await inspectSponsorCheckpoint(runner);
                assert.equal(
                  checks.every(row => row.matches0105),
                  claimGranted
                );
              },
            },
            async (client, fixture) => {
              assertRefusal(await fixture.run(), 'SPONSOR_CHECKPOINT_REJECTED');
              await assertLedger(client, fixture.journal, prefix);
              const [{ granted }] = await client`SELECT pg_catalog.has_column_privilege(
            ${sponsorRuntimeRole}, 'public.claim', 'updatedAt', 'UPDATE') AS granted`;
              assert.equal(granted, claimGranted);
            }
          );
        }
      );
    }
  });
});
