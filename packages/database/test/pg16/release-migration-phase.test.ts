import assert from 'node:assert/strict';
import { cpSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { assertTransactionalMigration } from '../../src/release-migration-sql';
import { readReleaseJournal, sha256 } from '../../src/release-migrations';
import { exerciseRefusals, proveContractOnce } from './release-migration-approvals.fixture';
import {
  assertLedger,
  assertRefusal,
  releaseFixture,
  releasePhaseDatabaseUrl,
  scratchOptions,
  withReleaseDatabase,
} from './release-migration-fixture';
import { folder, makeJournal, policy, workspace } from './release-migration-journal.fixture';
import {
  migrateJournal,
  type ScratchClient,
  scratchServerMissing,
  withScratchDatabase,
} from './scratch-database';

const requireDatabase = 'REQUIRE_JOURNAL_SCHEMA_PARITY';

test('validates the pinned registry and every base migration split', () => {
  const journal = readReleaseJournal(folder, policy, { candidateRoot: folder, policyRoot: folder });
  for (const { idx, tag } of journal.entries) {
    for (const statement of journal.migrations[idx].sql)
      assert.doesNotThrow(() => assertTransactionalMigration(statement), tag);
  }
});

test('phase policy reserves exact tags and positions independently of the candidate', t => {
  const read = (names?: string[]) => {
    const { dir, registry } = makeJournal(t, { names });
    // A candidate registry cannot make a renamed or otherwise invalid journal eligible.
    writeFileSync(`${dir}/contract-phases.json`, '{}');
    return readReleaseJournal(dir, registry, { candidateRoot: dir, policyRoot: dir });
  };
  assert.deepEqual(read(['0000_base']).contracts, []);
  assert.deepEqual(read().contracts, [2]);
  for (const names of [
    ['0000_base', '0001_writer_expand'],
    ['0000_base', '0002_writer_contract', '0001_writer_expand'],
    ['0000_base', '0001_other_expand', '0002_other_contract'],
    ['0000_base', '0001_renamed', '0002_renamed'],
    ['0000_base', '0001_intervening', '0002_writer_expand', '0003_writer_contract'],
  ])
    assert.throws(() => read(names), /JOURNAL_ENTRY_INVALID|REGISTERED_PAIR_MISMATCH/u);
  const dormant = makeJournal(t, { names: ['0000_renamed'] });
  writeFileSync(`${dormant.dir}/0000_renamed.sql`, 'ALTER TABLE writer DROP COLUMN legacy');
  assert.throws(
    () =>
      readReleaseJournal(dormant.dir, dormant.registry, {
        candidateRoot: dormant.dir,
        policyRoot: dormant.dir,
      }),
    /UNREGISTERED_PHASE/u
  );
  const { dir, registry } = makeJournal(t);
  writeFileSync(`${dir}/0002_writer_contract.sql`, 'SELECT 1');
  const readEdited = () =>
    readReleaseJournal(dir, registry, { candidateRoot: dir, policyRoot: dir });
  assert.throws(readEdited, /REGISTERED_PHASE_SQL_MISMATCH/u);
  rmSync(registry);
  assert.throws(readEdited, { code: 'ENOENT' });
});

test('refuses symlink escapes from the candidate journal, SQL and policy roots', t => {
  const outside = makeJournal(t);
  for (const entry of ['meta', '0000_base.sql', 'owner-policy.json']) {
    const { dir, registry } = makeJournal(t);
    const file = join(dir, entry);
    rmSync(file, { recursive: true });
    symlinkSync(join(outside.dir, entry), file);
    assert.throws(
      () => readReleaseJournal(dir, registry, { candidateRoot: dir, policyRoot: dir }),
      /RELEASE_PATH_REJECTED/u,
      entry
    );
  }
  const root = workspace(t);
  const candidate = join(root, 'drizzle');
  symlinkSync(outside.dir, candidate);
  assert.throws(
    () =>
      readReleaseJournal(candidate, outside.registry, {
        candidateRoot: root,
        policyRoot: outside.dir,
      }),
    /RELEASE_PATH_REJECTED/u
  );
});

test('refuses top-level transaction and session control in a split', () => {
  assertTransactionalMigration("SELECT '; COMMIT;', $$ BEGIN; END; $$; /* COMMIT; */ SELECT 1");
  for (const keyword of ['COMMIT', 'END', 'ROLLBACK', 'PREPARE TRANSACTION', 'START TRANSACTION'])
    assert.throws(
      () => assertTransactionalMigration(`SELECT 1; /* nested /* comment */ end */ ${keyword};`),
      /MIGRATION_TRANSACTION_CONTROL/u
    );
  for (const command of [
    'SET search_path TO pg_temp',
    'SET ROLE other',
    'RESET ALL',
    'DISCARD ALL',
  ])
    assert.throws(
      () => assertTransactionalMigration(`SELECT 1; ${command};`),
      /MIGRATION_SESSION_CONTROL/u
    );
});

test('CLI spends an authenticated approval even if the manifest is missing', async t => {
  const { dir, registry } = makeJournal(t);
  const unusedUrl = new URL(
    'postgres://unused:unused@127.0.0.1:5432/interdomestik_admin_config_unused'
  );
  const fixture = releaseFixture(unusedUrl, { t, dir, registry });
  const manifest = JSON.stringify({
    version: 1,
    environment: fixture.config.environment,
    commitSha: fixture.config.commitSha,
    plan: {},
  });
  const approval = fixture.approval({ ...fixture.receipt(), manifestSha256: sha256(manifest) });
  assertRefusal(await fixture.run('contract', approval), 'MANIFEST_MISSING_OR_SIZE');
  writeFileSync(fixture.files('manifest.json'), manifest);
  assertRefusal(await fixture.run('contract', approval), 'RECEIPT_REPLAYED');
});

test('CLI refuses candidate and config inputs outside their declared roots', async t => {
  const { dir, registry } = makeJournal(t);
  const unusedUrl = new URL(
    'postgres://unused:unused@127.0.0.1:5432/interdomestik_admin_config_unused'
  );
  const fixture = releaseFixture(unusedUrl, { t, dir, registry });
  assertRefusal(
    await fixture.run('inspect', { RELEASE_PHASE_CANDIDATE_ROOT: workspace(t) }),
    'RELEASE_PATH_REJECTED'
  );

  const outsideConfig = join(workspace(t), 'config.json');
  writeFileSync(outsideConfig, JSON.stringify(fixture.config));
  const link = fixture.files('linked-config.json');
  symlinkSync(outsideConfig, link);
  assertRefusal(
    await fixture.run('expand', { RELEASE_PHASE_CONFIG: link }),
    'RELEASE_PATH_REJECTED'
  );
});

test('release fixture and CLI refuse a Drizzle directory symlinked outside the export', async t => {
  const { dir: outside } = makeJournal(t, { names: ['0000_base'] });
  const candidateRoot = workspace(t);
  const dir = join(candidateRoot, 'drizzle');
  cpSync(outside, dir, { recursive: true });
  const unusedUrl = new URL(
    'postgres://unused:unused@127.0.0.1:5432/interdomestik_admin_config_unused'
  );
  const inputs = { t, dir, registry: policy, candidateRoot };
  const fixture = releaseFixture(unusedUrl, inputs);
  const inside = await fixture.run('inspect');
  assert.equal(inside.code, 0, inside.stderr);

  rmSync(dir, { recursive: true });
  symlinkSync(outside, dir);
  assert.throws(() => releaseFixture(unusedUrl, inputs), /RELEASE_PATH_REJECTED/u);
  assertRefusal(await fixture.run('inspect'), 'RELEASE_PATH_REJECTED');
});

async function assertOldWriter(client: ScratchClient) {
  const columns = await client`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'writer' ORDER BY ordinal_position`;
  assert.deepEqual(
    columns.map(row => row.column_name),
    ['id', 'legacy', 'replacement']
  );
  const [written] = await client`INSERT INTO writer (legacy) VALUES (42) RETURNING replacement`;
  assert.equal(written.replacement, 0);
}

test('PG16 synthetic CLI stops at expand, refuses bad approvals and verifies recovery', async t => {
  const missing = scratchServerMissing(requireDatabase, releasePhaseDatabaseUrl());
  if (missing) return t.skip(missing);
  const { dir, registry } = makeJournal(t);
  await withReleaseDatabase(
    'interdomestik_admin_config_phase',
    { t, dir, registry },
    async (client, fixture) => {
      const plan = await fixture.expand();
      assert.equal(plan.expand.tag, '0001_writer_expand');
      assert.equal(plan.contract?.tag, '0002_writer_contract');
      await assertLedger(client, fixture.journal, 2);
      assertRefusal(await fixture.run('recover'), 'RECOVERY_AT_EXPAND');
      await exerciseRefusals(t, fixture, async () => {
        await assertLedger(client, fixture.journal, 2);
        await assertOldWriter(client);
      });
      await proveContractOnce(fixture);
      await assertLedger(client, fixture.journal, 3);
      const recovered = await fixture.run('recover');
      assert.equal(recovered.code, 0, recovered.stderr);
      assert.equal(JSON.parse(recovered.stdout).status, 'verified-committed');
      const competingRecovery = await client.begin(async tx => {
        await tx`SELECT pg_catalog.pg_advisory_xact_lock(673167055, -773281837)`;
        const recovery = fixture.run('recover');
        const deadline = Date.now() + 10_000;
        while (true) {
          const [lock] = await tx`
            SELECT EXISTS (
              SELECT 1 FROM pg_catalog.pg_locks WHERE NOT granted AND locktype = 'advisory'
                AND database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
            ) AS waiting
          `;
          if (lock.waiting) break;
          assert.ok(Date.now() < deadline, 'Recovery must wait on the original transaction');
          await delay(50);
        }
        await tx`ALTER TABLE writer ADD COLUMN legacy integer NOT NULL DEFAULT 0`;
        return { recovery };
      });
      await assertLedger(client, fixture.journal, 3);
      assertRefusal(await competingRecovery.recovery, 'PHASE_SCHEMA_DIVERGENT');
      await client`ALTER TABLE writer DROP COLUMN legacy`;
      await fixture.expand();
      await assertLedger(client, fixture.journal, 4);
      await client`INSERT INTO writer (replacement, suffix) VALUES (1, 2)`;
    }
  );
});

test('PG16 CLI rolls back a failed contract and refuses divergent ordered history and ACLs', async t => {
  const missing = scratchServerMissing(requireDatabase, releasePhaseDatabaseUrl());
  if (missing) return t.skip(missing);
  const { dir, registry } = makeJournal(t, {
    contract:
      'ALTER TABLE writer DROP COLUMN legacy;--> statement-breakpoint\nSELECT missing_column FROM writer',
  });
  await withReleaseDatabase(
    'interdomestik_admin_config_atomic',
    { t, dir, registry },
    async (client, fixture) => {
      writeFileSync(
        fixture.files('config.json'),
        JSON.stringify({ ...fixture.config, backendMarkerSha256: '0'.repeat(64) })
      );
      assertRefusal(await fixture.run(), 'BACKEND_MISMATCH');
      writeFileSync(fixture.files('config.json'), JSON.stringify(fixture.config));
      await fixture.expand();
      const divergentAttempt = fixture.approval();
      await client`UPDATE drizzle.__drizzle_migrations SET created_at = 90 WHERE id = 1`;
      assertRefusal(await fixture.run('contract', divergentAttempt), 'LEDGER_DIVERGENT');
      await client`UPDATE drizzle.__drizzle_migrations SET created_at = 20 WHERE id = 1`;
      assertRefusal(await fixture.run('contract', divergentAttempt), 'RECEIPT_REPLAYED');
      const aclAttempt = fixture.approval();
      await client`GRANT INSERT ON drizzle.__drizzle_migrations TO PUBLIC`;
      assertRefusal(await fixture.run('contract', aclAttempt), 'MIGRATION_LEDGER_ACL_REJECTED');
      await client`REVOKE INSERT ON drizzle.__drizzle_migrations FROM PUBLIC`;
      assertRefusal(await fixture.run('contract', aclAttempt), 'RECEIPT_REPLAYED');
      await assertLedger(client, fixture.journal, 2);
      await assertOldWriter(client);
      const approval = fixture.approval();
      assertRefusal(await fixture.run('contract', approval), 'MIGRATION_SQL_FAILED');
      assertRefusal(await fixture.run('contract', approval), 'RECEIPT_REPLAYED');
      await assertLedger(client, fixture.journal, 2);
      await assertOldWriter(client);
    }
  );
});

test('PG16 disposable full migration still applies the pair and suffix', async t => {
  const missing = scratchServerMissing(requireDatabase);
  if (missing) return t.skip(missing);
  const { dir, registry } = makeJournal(t);
  await withScratchDatabase(
    'release_phase_disposable',
    async client => {
      await migrateJournal(client, dir);
      await assertLedger(
        client,
        readReleaseJournal(dir, registry, { candidateRoot: dir, policyRoot: dir }),
        4
      );
      await client`INSERT INTO writer (replacement, suffix) VALUES (1, 2)`;
    },
    scratchOptions
  );
});
