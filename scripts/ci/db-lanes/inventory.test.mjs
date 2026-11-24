import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  buildInventory,
  readExclusions,
  repoRoot,
  repositoryInventory,
  trackedTests,
} from './inventory.mjs';
import { protectedLanes } from './protected-lanes.mjs';

function scratch(t) {
  const root = mkdtempSync(join(tmpdir(), 'db-lanes-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  return root;
}

const docked = 'packages/database/test/pg16/local-container.test.ts';
const exception = {
  file: docked,
  reason: 'Starts its own container.',
  owner: 'Database',
  removeWhen: 'The suite can use the job service.',
};

for (const [label, source, error] of [
  ['missing', undefined, /missing/u],
  ['empty', ' \n', /empty/u],
  ['unparseable', '{', /invalid JSON/u],
  ['valid-but-empty', '[]', /at least one exclusion/u],
]) {
  test(`rejects a ${label} exclusions manifest`, t => {
    const manifest = join(scratch(t), 'exclusions.json');
    if (source !== undefined) writeFileSync(manifest, source);
    assert.throws(() => readExclusions(manifest), error);
  });
}

test('requires an individual, complete exemption and catches stale and duplicate records', t => {
  const manifest = join(scratch(t), 'exclusions.json');
  writeFileSync(manifest, JSON.stringify([exception]));
  assert.deepEqual(buildInventory([docked], [], readExclusions(manifest)), [
    { file: docked, lanes: [], exclusion: exception },
  ]);
  for (const entry of [
    { ...exception, reason: ' ' },
    { ...exception, file: '**/*.test.ts' },
  ]) {
    writeFileSync(manifest, JSON.stringify([entry]));
    assert.throws(() => readExclusions(manifest), /invalid exclusion/u);
  }
  writeFileSync(manifest, JSON.stringify([exception, exception]));
  assert.throws(() => readExclusions(manifest), /duplicate exclusion/u);
  assert.throws(() => buildInventory([], [], [exception]), /exclusion is not a tracked test/u);
});

test('discovers a newly tracked orphan independently of advisory selectors', t => {
  const root = scratch(t);
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-q');
  const orphan = 'packages/other/test/new-db.test.ts';
  const fixture = 'packages/other/test/support.ts';
  const untracked = 'packages/other/test/not-in-ci.test.ts';
  const futureWeb = 'apps/web/src/app/[locale]/(staff)/new.rls.test.ts';
  const futureDomain = 'packages/domain-claims/src/accepted.postgres.test.ts';
  for (const file of [orphan, fixture, untracked, futureWeb, futureDomain]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), '');
  }
  git('add', '--', orphan, fixture, futureWeb, futureDomain);

  const files = trackedTests(root);
  assert.deepEqual(files, [futureWeb, futureDomain, orphan]);
  assert.throws(() => buildInventory(files, [], []), /no CI lane.*new-db\.test\.ts/u);
  const inventory = buildInventory(files, [], [{ ...exception, file: orphan }]);
  assert.deepEqual(
    inventory.map(row => row.lanes),
    [['advisory/vitest-pg16'], ['advisory/vitest-pg16'], []]
  );
});

test('uses the existing explicit lane before selecting advisory execution', () => {
  const file = 'packages/database/test/restricted-role.test.ts';
  const lane = { name: 'e2e-gate/RLS', files: [file] };
  assert.deepEqual(buildInventory([file], [lane], []), [{ file, lanes: [lane.name] }]);
  assert.throws(() => buildInventory([], [lane], []), /selects an untracked test/u);
  assert.throws(
    () => buildInventory([file], [lane], [{ ...exception, file }]),
    /excluded.*already selected/u
  );
});

test('inventories the checked-out selectors', () => {
  const rows = new Map(repositoryInventory().map(row => [row.file, row]));
  for (const [file, lane] of [
    ['packages/database/test/pg16/journal-schema-parity.test.ts', 'e2e-gate/journal-parity'],
    ['packages/database/test/s8-claim-restricted-rls.test.ts', 'e2e-gate/RLS'],
    ['packages/domain-membership-billing/test/exchange-rates-port.test.ts', 'e2e-gate/RLS'],
    ['apps/web/src/lib/refusal-audit-rls.integration.test.ts', 'e2e-gate/RLS'],
    ['packages/domain-users/src/admin/get-users.rls.test.ts', 'unit/coverage'],
    ['packages/database/test/access-tenant-rls-migration.test.ts', 'advisory/node-unit'],
    ['packages/database/test/sponsor-foreign-keys.test.ts', 'advisory/node-pg16'],
    [
      'packages/domain-membership-billing/src/paddle-webhooks/handlers/dunning-recovery.postgres.test.ts',
      'advisory/vitest-pg16',
    ],
  ]) {
    assert.ok(rows.get(file)?.lanes.includes(lane), file);
  }
});

test('fails closed when a protected test runner adds an unrecognized case filter', t => {
  const root = scratch(t);
  for (const file of [
    '.github/workflows/ci.yml',
    'package.json',
    'packages/database/package.json',
    'packages/domain-communications/package.json',
    'packages/domain-membership-billing/package.json',
    'packages/domain-users/package.json',
    'scripts/run-staff-detail-rls.mjs',
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(repoRoot, file), join(root, file));
  }
  assert.ok(protectedLanes(root)[0].files.length > 0);
  const filename = join(root, 'packages/database/package.json');
  const manifest = JSON.parse(readFileSync(filename, 'utf8'));
  manifest.scripts['test:rls'] += ' --test-name-pattern=never-matches';
  writeFileSync(filename, JSON.stringify(manifest));
  assert.throws(() => protectedLanes(root), /unsupported file selector.*database test:rls/iu);
});
