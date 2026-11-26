import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { assertTransactionalMigration } from '../../src/release-migration-sql';
import { readReleaseJournal, sha256 } from '../../src/release-migrations';
import {
  assertLedger,
  assertRefusal,
  folder,
  makeJournal,
  policy,
  releaseFixture,
  scratchOptions,
  withReleaseDatabase,
} from './release-migration-fixture';
import {
  migrateJournal,
  type ScratchClient,
  scratchServerMissing,
  withScratchDatabase,
} from './scratch-database';

const requireDatabase = 'REQUIRE_JOURNAL_SCHEMA_PARITY';

test('validates the pinned registry and every base migration split', () => {
  const journal = readReleaseJournal(folder, policy);
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
    return readReleaseJournal(dir, registry);
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
  assert.throws(() => readReleaseJournal(dormant.dir, dormant.registry), /UNREGISTERED_PHASE/u);
  const { dir, registry } = makeJournal(t);
  writeFileSync(`${dir}/0002_writer_contract.sql`, 'SELECT 1');
  assert.throws(() => readReleaseJournal(dir, registry), /REGISTERED_PHASE_SQL_MISMATCH/u);
  rmSync(registry);
  assert.throws(() => readReleaseJournal(dir, registry), { code: 'ENOENT' });
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

type Fixture = Awaited<ReturnType<typeof releaseFixture>>;

test('CLI spends an authenticated approval even if the manifest is missing', async t => {
  const { dir, registry } = makeJournal(t);
  const unusedUrl = new URL(
    'postgres://unused:unused@127.0.0.1:5432/interdomestik_admin_config_unused'
  );
  const fixture = releaseFixture(t, unusedUrl, dir, registry);
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

async function exerciseRefusals(
  t: TestContext,
  fixture: Fixture,
  afterRefusal: () => Promise<void>
) {
  const { run, approval, receipt, live, livePath } = fixture;
  const expired = receipt();
  const wrongBuild = receipt();
  expired.expiresAt = expired.observedAt;
  const staleApproval = approval();
  for (const [name, input, reason] of [
    ['missing', approval(receipt(), { raw: null }), 'RECEIPT_MISSING_OR_SIZE'],
    ['empty', approval(receipt(), { raw: Buffer.alloc(0) }), 'RECEIPT_MISSING_OR_SIZE'],
    ['unparseable', approval(receipt(), { raw: Buffer.from('{') }), 'RECEIPT_JSON_INVALID'],
    ['valid empty', approval(receipt(), { raw: Buffer.from('{}') }), 'RECEIPT_SHAPE_INVALID'],
    ['forged', approval(receipt(), { forged: true }), 'RECEIPT_SIGNATURE_INVALID'],
    [
      'wrong manifest',
      approval({ ...receipt(), manifestSha256: '0'.repeat(64) }),
      'RECEIPT_BINDING_MISMATCH',
    ],
    [
      'wrong attempt',
      { ...approval(), RELEASE_PHASE_ATTEMPT: '0'.repeat(64) },
      'RECEIPT_BINDING_MISMATCH',
    ],
    [
      'wrong build digest',
      approval({
        ...wrongBuild,
        deployment: { ...wrongBuild.deployment, buildDigest: `sha256:${'0'.repeat(64)}` },
      }),
      'DEPLOYMENT_ATTESTATION_MISMATCH',
    ],
    ['expired', approval(expired), 'RECEIPT_EXPIRED'],
    [
      'missing manifest',
      { ...approval(), RELEASE_PHASE_MANIFEST: fixture.files('absent') },
      'MANIFEST_MISSING_OR_SIZE',
    ],
  ] as const) {
    await t.test(name, async () => {
      assertRefusal(await run('contract', input), reason);
      await afterRefusal();
    });
  }
  await t.test('alias moved away and back to the same deployment', async () => {
    writeFileSync(
      livePath,
      JSON.stringify({ ...live, alias: { ...live.alias, updatedAt: live.alias.updatedAt + 1 } })
    );
    assertRefusal(await run('contract', staleApproval), 'CANONICAL_ALIAS_MISMATCH');
    await afterRefusal();
  });
  await t.test('replay of consumed approval while still at expand', async () => {
    writeFileSync(livePath, JSON.stringify(live));
    assertRefusal(await run('contract', staleApproval), 'RECEIPT_REPLAYED');
    await afterRefusal();
  });
}

async function proveContractOnce(fixture: Fixture) {
  const approval = fixture.approval();
  const results = await Promise.all([
    fixture.run('contract', approval),
    fixture.run('contract', approval),
  ]);
  const [committed, refused] = results.sort((a, b) => Number(a.code) - Number(b.code));
  assert.equal(committed.code, 0, committed.stderr);
  assert.equal(JSON.parse(committed.stdout).status, 'contracted');
  assertRefusal(refused, 'RECEIPT_REPLAYED');
}

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
  const missing = scratchServerMissing(requireDatabase);
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
  const missing = scratchServerMissing(requireDatabase);
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
      await assertLedger(client, readReleaseJournal(dir, registry), 4);
      await client`INSERT INTO writer (replacement, suffix) VALUES (1, 2)`;
    },
    scratchOptions
  );
});

test('PG16 WP-07 candidate CLI preserves same-week publications and checks the active guard', async t => {
  const candidate = process.env.RELEASE_PHASE_WP07_CANDIDATE ?? folder;
  const journal = readReleaseJournal(candidate, policy);
  if (journal.entries[112]?.tag !== '0112_wp07_rate_check_contract') {
    assert.notEqual(
      process.env.REQUIRE_RELEASE_PHASE_WP07,
      '1',
      'The exact reviewed WP-07 pair is required'
    );
    return t.skip('WP-07 pair is dormant in this checkout');
  }
  const missing = scratchServerMissing(
    process.env.REQUIRE_RELEASE_PHASE_WP07 === '1' ? 'REQUIRE_RELEASE_PHASE_WP07' : requireDatabase
  );
  if (missing) return t.skip(missing);
  const commit =
    process.env.RELEASE_PHASE_WP07_COMMIT ??
    (candidate === folder
      ? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      : '');
  assert.match(
    commit,
    /^[a-f0-9]{40}$/u,
    'Supply the exact reviewed candidate commit for an exported journal'
  );

  await withReleaseDatabase(
    'interdomestik_admin_config_wp07',
    { t, dir: candidate, registry: policy, commitSha: commit },
    async (client, fixture) => {
      const plan = await fixture.expand();
      assert.deepEqual(
        [plan.expand.tag, plan.contract?.tag, plan.expandCount, plan.finalCount],
        ['0111_wp07_rate_check_expand', '0112_wp07_rate_check_contract', 112, 113]
      );
      let bookIndex = 0;
      let lastTenant = '';
      let lastBook = '';
      let oldRate = '';
      await exerciseRefusals(t, fixture, async () => {
        await assertLedger(client, journal, 112);
        const [shape] = await client`
        SELECT pg_catalog.to_regclass('public.exchange_rate_check_events') IS NOT NULL AS events,
          pg_catalog.to_regclass('public.exchange_rate_check_windows') IS NOT NULL AS windows,
          EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
            WHERE attrelid = 'public.exchange_rate_verifications'::regclass
              AND attname = 'check_id' AND NOT attnotnull AND NOT attisdropped) AS nullable_check,
          NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
            WHERE tgrelid = 'public.exchange_rate_verifications'::regclass
              AND tgname = 'exchange_rate_verifications_check_required') AS predecessor_guard
      `;
        assert.deepEqual(shape, {
          events: true,
          windows: true,
          nullable_check: true,
          predecessor_guard: true,
        });
        lastBook = `release-book-${++bookIndex}`;
        lastTenant = `release-phase-${bookIndex}`;
        oldRate = `old-rate-${bookIndex}`;
        await client`INSERT INTO tenants (id, name, legal_name, country_code)
        VALUES (${lastTenant}, 'Release phase', 'Release phase', 'MK')`;
        await client`INSERT INTO exchange_rate_books (id, tenant_id, base, quote)
        VALUES (${lastBook}, ${lastTenant}, 'EUR', 'MKD')`;
        const [old] = await client`INSERT INTO exchange_rates
        (id, tenant_id, book_id, base, quote, rate, effective_on, revision, source, caller_kind)
        VALUES (${oldRate}, ${lastTenant}, ${lastBook}, 'EUR', 'MKD', 61.5, '2026-11-23', 1, 'nbrm', 'inngest')
        ON CONFLICT (tenant_id, book_id, week_starts_on, revision) DO NOTHING RETURNING id`;
        assert.equal(old.id, oldRate);
      });
      await proveContractOnce(fixture);
      await assertLedger(client, journal, 113);
      await t.test(
        'recovery rejects the same FK name and target with a different mapping',
        async () => {
          await client`ALTER TABLE exchange_rate_verifications
          DROP CONSTRAINT exchange_rate_verifications_check_fk,
          ADD CONSTRAINT exchange_rate_verifications_check_fk
          FOREIGN KEY (tenant_id, book_id, verified_by, legal_entity_id, check_id, rate_id)
          REFERENCES exchange_rate_check_events (tenant_id, book_id, id, legal_entity_id, actor_id, rate_id)`;
          await assertLedger(client, journal, 113);
          assertRefusal(await fixture.run('recover'), 'PHASE_SCHEMA_DIVERGENT');
          await client`ALTER TABLE exchange_rate_verifications
          DROP CONSTRAINT exchange_rate_verifications_check_fk,
          ADD CONSTRAINT exchange_rate_verifications_check_fk
          FOREIGN KEY (tenant_id, book_id, check_id, legal_entity_id, verified_by, rate_id)
          REFERENCES exchange_rate_check_events (tenant_id, book_id, id, legal_entity_id, actor_id, rate_id)`;
        }
      );
      await t.test(
        'recovery rejects a renamed weekly key and a standalone weekly index',
        async () => {
          await client`ALTER TABLE exchange_rates ADD CONSTRAINT alternate_weekly_constraint
          UNIQUE (tenant_id, book_id, week_starts_on, revision)`;
          await assertLedger(client, journal, 113);
          assertRefusal(await fixture.run('recover'), 'PHASE_SCHEMA_DIVERGENT');
          await client`ALTER TABLE exchange_rates DROP CONSTRAINT alternate_weekly_constraint`;
          await client`CREATE UNIQUE INDEX alternate_weekly_index
          ON exchange_rates (week_starts_on, book_id, tenant_id) INCLUDE (revision)`;
          await assertLedger(client, journal, 113);
          assertRefusal(await fixture.run('recover'), 'PHASE_SCHEMA_DIVERGENT');
          await client`DROP INDEX alternate_weekly_index`;
        }
      );
      await t.test('recovery rejects a weekly unique index with source in its key', async () => {
        await client`CREATE UNIQUE INDEX weekly_source_index
          ON exchange_rates (tenant_id, book_id, week_starts_on, revision, source)`;
        await assertLedger(client, journal, 113);
        assertRefusal(await fixture.run('recover'), 'PHASE_SCHEMA_DIVERGENT');
        await client`DROP INDEX weekly_source_index`;
      });
      await client`INSERT INTO exchange_rates
      (id, tenant_id, book_id, base, quote, rate, effective_on, revision, source, caller_kind)
      VALUES ('new-rate', ${lastTenant}, ${lastBook}, 'EUR', 'MKD', 61.6, '2026-11-24', 1, 'nbrm', 'inngest')`;
      const rates = await client`SELECT id, week_starts_on::text FROM exchange_rates
      WHERE book_id = ${lastBook} ORDER BY effective_on`;
      assert.deepEqual(
        [...rates],
        [
          { id: oldRate, week_starts_on: '2026-11-23' },
          { id: 'new-rate', week_starts_on: '2026-11-23' },
        ]
      );
      await assert.rejects(
        client`INSERT INTO exchange_rate_verifications (check_id) VALUES (NULL)`,
        {
          code: '23514',
          constraint_name: 'exchange_rate_verifications_check_required',
        }
      );
      const recovered = await fixture.run('recover');
      assert.equal(recovered.code, 0, recovered.stderr);
      assert.equal(JSON.parse(recovered.stdout).status, 'verified-committed');
      await client`ALTER TABLE exchange_rate_verifications DISABLE TRIGGER exchange_rate_verifications_check_required`;
      await assertLedger(client, journal, 113);
      assertRefusal(await fixture.run('recover'), 'PHASE_SCHEMA_DIVERGENT');
    }
  );

  await withScratchDatabase(
    'release_phase_wp07_full',
    async client => {
      await migrateJournal(client, candidate);
      await assertLedger(client, journal, journal.entries.length);
    },
    scratchOptions
  );
});
