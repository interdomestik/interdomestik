import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { resolveReleasePath } from '../../src/release-migration-path.mjs';
import { readReleaseJournal } from '../../src/release-migrations';
import { exerciseRefusals, proveContractOnce } from './release-migration-approvals.fixture';
import {
  assertLedger,
  assertRefusal,
  scratchOptions,
  withReleaseDatabase,
} from './release-migration-fixture';
import { folder, policy, workspace } from './release-migration-journal.fixture';
import { migrateJournal, scratchServerMissing, withScratchDatabase } from './scratch-database';

const requireDatabase = 'REQUIRE_JOURNAL_SCHEMA_PARITY';
const checkoutDrizzle = resolve(folder);
const checkoutRoot = resolve(checkoutDrizzle, '../../..');

function wp07Candidate(candidatePath: string | undefined, exportRoot: string | undefined) {
  if (candidatePath === undefined) return { dir: checkoutDrizzle, candidateRoot: checkoutRoot };
  assert.ok(candidatePath.trim(), 'RELEASE_PHASE_WP07_CANDIDATE must not be empty');
  assert.ok(exportRoot, 'RELEASE_PHASE_CANDIDATE_ROOT is required for a WP-07 export');
  const dir = resolve(candidatePath);
  assert.notEqual(
    resolveReleasePath(exportRoot, dir),
    realpathSync.native(exportRoot),
    'The WP-07 Drizzle directory must be inside the candidate export root'
  );
  return { dir, candidateRoot: exportRoot };
}

test('WP-07 defaults to the checkout only when the candidate is unset', () => {
  assert.deepEqual(wp07Candidate(undefined, undefined), {
    dir: checkoutDrizzle,
    candidateRoot: checkoutRoot,
  });
  for (const candidate of ['', ' ']) {
    assert.throws(
      () => wp07Candidate(candidate, undefined),
      /RELEASE_PHASE_WP07_CANDIDATE must not be empty/u
    );
  }
});

test('WP-07 requires a separate export root for an explicit candidate', t => {
  const candidateRoot = workspace(t);
  const dir = join(candidateRoot, 'drizzle');
  mkdirSync(dir);
  assert.throws(() => wp07Candidate(dir, undefined), /RELEASE_PHASE_CANDIDATE_ROOT is required/u);
  assert.throws(() => wp07Candidate(dir, dir), /must be inside the candidate export root/u);
  assert.deepEqual(wp07Candidate(dir, candidateRoot), { dir, candidateRoot });
});

test('release paths accept both root spellings and refuse a symlink leaf with noSymlink', t => {
  const canonicalRoot = realpathSync.native(workspace(t));
  const declaredRoot = join(workspace(t), 'export');
  symlinkSync(canonicalRoot, declaredRoot, 'dir');
  const canonicalChild = join(canonicalRoot, 'drizzle');
  mkdirSync(canonicalChild);

  assert.equal(resolveReleasePath(declaredRoot, declaredRoot), canonicalRoot);
  assert.equal(resolveReleasePath(declaredRoot, canonicalRoot, { noSymlink: true }), canonicalRoot);
  assert.equal(resolveReleasePath(declaredRoot, canonicalChild), canonicalChild);
  assert.equal(
    resolveReleasePath(declaredRoot, join(declaredRoot, 'drizzle'), { noSymlink: true }),
    canonicalChild
  );
  assert.throws(
    () => resolveReleasePath(declaredRoot, declaredRoot, { noSymlink: true }),
    /RELEASE_PATH_REJECTED/u
  );
});

test('PG16 WP-07 candidate CLI preserves same-week publications and checks the active guard', async t => {
  const candidatePath = process.env.RELEASE_PHASE_WP07_CANDIDATE;
  const { dir: candidate, candidateRoot } = wp07Candidate(
    candidatePath,
    process.env.RELEASE_PHASE_CANDIDATE_ROOT
  );
  const journal = readReleaseJournal(candidate, policy, {
    candidateRoot,
    policyRoot: folder,
  });
  if (journal.entries[113]?.tag !== '0113_wp07_rate_check_contract') {
    assert.ok(
      candidatePath === undefined && process.env.REQUIRE_RELEASE_PHASE_WP07 !== '1',
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
    (candidate === checkoutDrizzle
      ? execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      : '');
  assert.match(
    commit,
    /^[a-f0-9]{40}$/u,
    'Supply the exact reviewed candidate commit for an exported journal'
  );

  await withReleaseDatabase(
    'interdomestik_admin_config_wp07',
    { t, dir: candidate, candidateRoot, registry: policy, commitSha: commit },
    async (client, fixture) => {
      const plan = await fixture.expand();
      assert.deepEqual(
        [plan.expand.tag, plan.contract?.tag, plan.expandCount, plan.finalCount],
        ['0112_wp07_rate_check_expand', '0113_wp07_rate_check_contract', 113, 114]
      );
      let bookIndex = 0;
      let lastTenant = '';
      let lastBook = '';
      let oldRate = '';
      await exerciseRefusals(t, fixture, async () => {
        await assertLedger(client, journal, 113);
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
      await assertLedger(client, journal, 114);
      await t.test(
        'recovery rejects the same FK name and target with a different mapping',
        async () => {
          await client`ALTER TABLE exchange_rate_verifications
          DROP CONSTRAINT exchange_rate_verifications_check_fk,
          ADD CONSTRAINT exchange_rate_verifications_check_fk
          FOREIGN KEY (tenant_id, book_id, verified_by, legal_entity_id, check_id, rate_id)
          REFERENCES exchange_rate_check_events (tenant_id, book_id, id, legal_entity_id, actor_id, rate_id)`;
          await assertLedger(client, journal, 114);
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
          await assertLedger(client, journal, 114);
          assertRefusal(await fixture.run('recover'), 'PHASE_SCHEMA_DIVERGENT');
          await client`ALTER TABLE exchange_rates DROP CONSTRAINT alternate_weekly_constraint`;
          await client`CREATE UNIQUE INDEX alternate_weekly_index
          ON exchange_rates (week_starts_on, book_id, tenant_id) INCLUDE (revision)`;
          await assertLedger(client, journal, 114);
          assertRefusal(await fixture.run('recover'), 'PHASE_SCHEMA_DIVERGENT');
          await client`DROP INDEX alternate_weekly_index`;
        }
      );
      await t.test('recovery rejects a weekly unique index with source in its key', async () => {
        await client`CREATE UNIQUE INDEX weekly_source_index
          ON exchange_rates (tenant_id, book_id, week_starts_on, revision, source)`;
        await assertLedger(client, journal, 114);
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
      await assertLedger(client, journal, 114);
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
