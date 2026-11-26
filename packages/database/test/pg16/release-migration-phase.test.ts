import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  digest,
  verifyDrainReceipt,
  verifyGitHubApproval,
} from '../../../../scripts/ci/migration-phase/proof.mjs';
import { assertTransactionalMigration } from '../../src/release-migration-sql';
import { readReleaseJournal, runReleaseMigrations } from '../../src/release-migrations';
import {
  migrateJournal,
  type ScratchClient,
  scratchServerMissing,
  withScratchDatabase,
} from './scratch-database';

const folder = fileURLToPath(new URL('../../drizzle/', import.meta.url));
const marker = 'scratch-release-backend';
const markerSha256 = digest(marker);
const syntheticTags = ['0000_base', '0001_writer_expand', '0002_writer_contract', '0003_suffix'];
const syntheticSQL = [
  'CREATE TABLE writer (id serial PRIMARY KEY, legacy integer NOT NULL)',
  'ALTER TABLE writer ADD COLUMN replacement integer DEFAULT 0 NOT NULL',
  'ALTER TABLE writer DROP COLUMN legacy',
  'ALTER TABLE writer ADD COLUMN suffix integer',
];
const pairs = { '0002_writer_contract': '0001_writer_expand' };

function makeJournal(
  t: test.TestContext,
  { tags = syntheticTags, sql = syntheticSQL, registry = pairs } = {}
) {
  const temp = mkdtempSync(path.join(tmpdir(), 'release-phase-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  mkdirSync(path.join(temp, 'meta'));
  // Deliberately inverted history. Drizzle stores these exact times in journal insertion order.
  const timestamps = [20, 10, 30, 40, 50, 60];
  const entries = tags.map((tag, idx) => ({
    idx,
    version: '7',
    when: timestamps[idx],
    tag,
    breakpoints: true,
  }));
  writeFileSync(path.join(temp, 'meta/_journal.json'), JSON.stringify({ version: '7', entries }));
  writeFileSync(
    path.join(temp, 'contract-phases.json'),
    JSON.stringify({ version: 1, pairs: registry })
  );
  entries.forEach(({ tag, idx }) => writeFileSync(path.join(temp, `${tag}.sql`), sql[idx]));
  return temp;
}

async function runOnScratch(
  client: ScratchClient,
  ...request: Parameters<typeof runReleaseMigrations> extends [unknown, ...infer Tail]
    ? Tail
    : never
) {
  const reserved = await client.reserve();
  try {
    return await runReleaseMigrations(reserved, ...request);
  } finally {
    reserved.release();
  }
}

async function bootstrap(client: ScratchClient) {
  await client`CREATE SCHEMA runtime_attestation`;
  await client`CREATE TABLE runtime_attestation.backend_marker (marker text PRIMARY KEY)`;
  await client`INSERT INTO runtime_attestation.backend_marker VALUES (${marker})`;
}

async function assertLedger(
  client: ScratchClient,
  journal: ReturnType<typeof readReleaseJournal>,
  count: number
) {
  const rows =
    await client`SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id`;
  assert.deepEqual(
    [...rows],
    journal.entries.slice(0, count).map(({ hash, when }) => ({
      hash,
      created_at: String(when),
    }))
  );
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

function approvalFor(plan: unknown) {
  const release = { manifest: { plan }, deploymentId: 'dpl_fixture', deploymentAttempt: '1' };
  const invocation = { environment: 'staging-migration-contract', runId: '1', attempt: '2' };
  const manifestSha256 = digest(JSON.stringify(release.manifest));
  const receipt = {
    version: 1,
    release,
    invocation,
    manifestSha256,
    evidence: {
      id: 'fixture',
      sha256: digest('fixture'),
      fence: 'fixture',
      writers: { webEndpoints: ['legacy'], workers: [], schedulers: [], queues: [] },
      outstandingWrites: 0,
      inFlightTransactions: 0,
      preparedTransactions: 0,
      observedAt: new Date(Date.now() - 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    },
  };
  const raw = JSON.stringify(receipt);
  const reviews = [
    {
      comment: `release-drain sha256:${digest(raw)}`,
      state: 'approved',
      environments: [{ name: invocation.environment }],
      user: { type: 'User', login: 'release-owner', id: 1 },
    },
  ];
  const authorize =
    (candidate: string | undefined, history = reviews) =>
    async () => {
      const evidence = verifyDrainReceipt(candidate, { release, invocation, manifestSha256 });
      verifyGitHubApproval(history, {
        environment: invocation.environment,
        reviewerIds: '1',
        receiptSha256: evidence.receiptSha256,
      });
      return evidence.expiresAt;
    };
  return { authorize, receipt, raw };
}

test('validates the base registry and every reviewed Drizzle SQL split', () => {
  const journal = readReleaseJournal(folder);
  for (const { idx, tag } of journal.entries) {
    for (const statement of journal.migrations[idx].sql)
      assert.doesNotThrow(() => assertTransactionalMigration(statement), tag);
  }
});

test('registration reserves dormant positions and refuses partial, reordered and renamed pairs', t => {
  const read = (tags: string[]) => readReleaseJournal(makeJournal(t, { tags }));
  assert.deepEqual(read(['0000_base']).contracts, []);
  assert.deepEqual(read(syntheticTags).contracts, [2]);
  for (const tags of [
    ['0000_base', '0001_writer_expand'],
    ['0000_base', '0002_writer_contract', '0001_writer_expand'],
    ['0000_base', '0001_elsewhere_expand', '0002_elsewhere_contract'],
    ['0000_base', '0001_renamed', '0002_renamed'],
    ['0000_base', '0001_intervening', '0002_writer_expand', '0003_writer_contract'],
  ])
    assert.throws(() => read(tags), /JOURNAL_ENTRY_INVALID|REGISTERED_PAIR_MISMATCH/u);
  const withoutRegistry = makeJournal(t);
  rmSync(path.join(withoutRegistry, 'contract-phases.json'));
  assert.throws(() => readReleaseJournal(withoutRegistry), /ENOENT/u);
});

test('refuses transaction control even after a different SQL command in a Drizzle split', () => {
  assertTransactionalMigration("SELECT '; COMMIT;', $$ BEGIN; END; $$; /* COMMIT; */ SELECT 1");
  for (const keyword of ['COMMIT', 'END', 'ROLLBACK', 'PREPARE TRANSACTION', 'START TRANSACTION'])
    assert.throws(
      () => assertTransactionalMigration(`SELECT 1; /* nested /* comment */ end */ ${keyword};`),
      /MIGRATION_TRANSACTION_CONTROL/u
    );
});

test('PG16 leaves expand exact for every refused receipt and commits contract once', async t => {
  const missing = scratchServerMissing('REQUIRE_JOURNAL_SCHEMA_PARITY');
  if (missing) return t.skip(missing);
  const journal = readReleaseJournal(makeJournal(t));
  await withScratchDatabase(
    'release_phase',
    async client => {
      await bootstrap(client);
      await assert.rejects(
        runOnScratch(client, journal, '0'.repeat(64), { mode: 'expand' }),
        /BACKEND_MISMATCH/u
      );
      const { plan } = await runOnScratch(client, journal, markerSha256, {
        mode: 'expand',
      });
      assert.equal(plan.expand?.tag, '0001_writer_expand');
      assert.equal(plan.contract?.tag, '0002_writer_contract');
      const { authorize, receipt, raw } = approvalFor(plan);
      const tryContract = (approval: () => Promise<number>) =>
        runOnScratch(client, journal, markerSha256, {
          mode: 'contract',
          plan,
          authorize: approval,
        });
      for (const [name, approval] of [
        ['missing', authorize(undefined)],
        ['empty', authorize('')],
        ['unparseable', authorize('{')],
        ['valid empty', authorize('{}')],
        [
          'wrong deployment',
          authorize(
            JSON.stringify({
              ...receipt,
              release: { ...receipt.release, deploymentId: 'dpl_wrong' },
            })
          ),
        ],
        [
          'expired',
          authorize(
            JSON.stringify({
              ...receipt,
              evidence: { ...receipt.evidence, expiresAt: new Date(0).toISOString() },
            })
          ),
        ],
        [
          'replayed contract invocation',
          authorize(
            JSON.stringify({
              ...receipt,
              invocation: { ...receipt.invocation, attempt: '1' },
            })
          ),
        ],
        ['no approval for these bytes', authorize(raw, [])],
      ] as const) {
        await t.test(name, async () => {
          await assert.rejects(tryContract(approval), /RECEIPT_/u);
          await assertLedger(client, journal, 2);
          await assertOldWriter(client);
        });
      }
      let approvals = 0;
      const approve = async () => {
        approvals++;
        return authorize(raw)();
      };
      const attempts = await Promise.all([tryContract(approve), tryContract(approve)]);
      assert.deepEqual(attempts.map(result => result.status).sort(), [
        'already-committed',
        'contracted',
      ]);
      assert.equal(approvals, 1);
      await assertLedger(client, journal, 4);
      await assert.rejects(client`INSERT INTO writer (legacy) VALUES (1)`, { code: '42703' });
      const [applied] =
        await client`INSERT INTO writer (replacement, suffix) VALUES (1, 2) RETURNING suffix`;
      assert.equal(applied.suffix, 2);
    },
    { loopbackOnly: true, requirePg16: true, maxConnections: 2 }
  );
});

test('PG16 refuses divergent history, and a failed contract rolls back schema and ledger', async t => {
  const missing = scratchServerMissing('REQUIRE_JOURNAL_SCHEMA_PARITY');
  if (missing) return t.skip(missing);
  const failing = [...syntheticSQL];
  failing[2] += ';--> statement-breakpoint\nSELECT missing_contract_column FROM writer';
  const journal = readReleaseJournal(makeJournal(t, { sql: failing }));
  await withScratchDatabase(
    'release_phase_atomic',
    async client => {
      await bootstrap(client);
      const { plan } = await runOnScratch(client, journal, markerSha256, {
        mode: 'expand',
      });
      const { authorize, raw } = approvalFor(plan);
      const tryContract = () =>
        runOnScratch(client, journal, markerSha256, {
          mode: 'contract',
          plan,
          authorize: authorize(raw),
        });
      await client`UPDATE drizzle.__drizzle_migrations SET created_at = 90 WHERE id = 1`;
      await assert.rejects(tryContract(), /LEDGER_DIVERGENT/u);
      await client`UPDATE drizzle.__drizzle_migrations SET created_at = 20 WHERE id = 1`;
      await assert.rejects(tryContract(), { code: '42703' });
      await assertLedger(client, journal, 2);
      await assertOldWriter(client);
    },
    { loopbackOnly: true, requirePg16: true }
  );
});

test('PG16 disposable full migration still applies both entries and the suffix', async t => {
  const missing = scratchServerMissing('REQUIRE_JOURNAL_SCHEMA_PARITY');
  if (missing) return t.skip(missing);
  const dir = makeJournal(t);
  const journal = readReleaseJournal(dir);
  await withScratchDatabase(
    'release_phase_disposable',
    async client => {
      await bootstrap(client);
      await migrateJournal(client, dir);
      await assertLedger(client, journal, 4);
      await assert.rejects(client`INSERT INTO writer (legacy) VALUES (1)`, { code: '42703' });
    },
    { loopbackOnly: true, requirePg16: true }
  );
});

test('PG16 WP-07 candidate keeps weekly publication at 0111 and preserves same-week dates after 0112', async t => {
  const journal = readReleaseJournal(folder);
  if (journal.entries[112]?.tag !== '0112_wp07_rate_check_contract')
    return t.skip('WP-07 pair is dormant in this checkout');
  const missing = scratchServerMissing('REQUIRE_JOURNAL_SCHEMA_PARITY');
  if (missing) return t.skip(missing);
  await withScratchDatabase(
    'release_phase_wp07',
    async client => {
      await bootstrap(client);
      const { plan } = await runOnScratch(client, journal, markerSha256, {
        mode: 'expand',
      });
      assert.equal(plan.expand?.tag, '0111_wp07_rate_check_expand');
      assert.equal(plan.contract?.tag, '0112_wp07_rate_check_contract');
      const { authorize, raw } = approvalFor(plan);
      const tryContract = (raw: string | undefined) =>
        runOnScratch(client, journal, markerSha256, {
          mode: 'contract',
          plan,
          authorize: authorize(raw),
        });
      await assert.rejects(tryContract(undefined), /RECEIPT_MISSING_OR_SIZE/u);
      await assertLedger(client, journal, 112);
      await client`INSERT INTO tenants (id, name, legal_name, country_code)
      VALUES ('release-phase', 'Release phase', 'Release phase', 'MK')`;
      await client`INSERT INTO exchange_rate_books (id, tenant_id, base, quote)
      VALUES ('release-book', 'release-phase', 'EUR', 'MKD')`;
      const [old] = await client`INSERT INTO exchange_rates
      (id, tenant_id, book_id, base, quote, rate, effective_on, revision, source, caller_kind)
      VALUES ('old-rate', 'release-phase', 'release-book', 'EUR', 'MKD', 61.5, '2026-11-23', 1, 'nbrm', 'inngest')
      ON CONFLICT (tenant_id, book_id, week_starts_on, revision) DO NOTHING RETURNING id`;
      assert.equal(old.id, 'old-rate');
      assert.equal((await tryContract(raw)).status, 'contracted');
      await assertLedger(client, journal, journal.entries.length);
      await client`INSERT INTO exchange_rates
      (id, tenant_id, book_id, base, quote, rate, effective_on, revision, source, caller_kind)
      VALUES ('new-rate', 'release-phase', 'release-book', 'EUR', 'MKD', 61.6, '2026-11-24', 1, 'nbrm', 'inngest')`;
      const rates = await client`SELECT id, week_starts_on::text FROM exchange_rates
        WHERE book_id = 'release-book' ORDER BY effective_on`;
      assert.deepEqual(
        [...rates],
        [
          { id: 'old-rate', week_starts_on: '2026-11-23' },
          { id: 'new-rate', week_starts_on: '2026-11-23' },
        ]
      );
    },
    { loopbackOnly: true, requirePg16: true }
  );
});
