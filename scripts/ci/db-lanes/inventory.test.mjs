import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { structuredArtifactOwner } from '../../modularity-guard-policy.mjs';
import { copyProtectedSelectors, scratch } from './inventory-fixture.mjs';
import {
  buildInventory,
  readExclusions,
  repoRoot,
  repositoryInventory,
  trackedTests,
} from './inventory.mjs';
import { protectedLanes } from './protected-lanes.mjs';

const docked = 'packages/database/test/pg16/local-container.test.ts';
const exception = {
  file: docked,
  reason: 'Starts its own container.',
  owner: 'Database',
  removeWhen: 'The suite can use the job service.',
};

test('the modularity guard recognizes the exact exclusions manifest', () => {
  assert.equal(
    structuredArtifactOwner('scripts/ci/db-lanes/exclusions.json'),
    'database-lane-inventory-contract'
  );
  assert.equal(structuredArtifactOwner('scripts/ci/db-lanes/unregistered.json'), null);
});

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

for (const [spec, prerequisites] of [
  ['gate/billing-webhook-retry-cas', /Playwright.*PostgreSQL.*concurrent receipt claims/u],
  ['gate/pilot-day1-notify', /PILOT_DB_MUTATION_TESTS=1.*member, agent, and staff.*claim/u],
  ['pilot/c2-03-cross-tenant-write-isolation', /Playwright.*seeded.*admin.*claim.*document/u],
  [
    'pilot/c2-04-cross-tenant-staff-member-write-isolation',
    /Playwright.*seeded.*staff.*member.*claim/u,
  ],
]) {
  test(`names the database prerequisites for excluding ${spec}`, () => {
    const exclusions = readExclusions(join(repoRoot, 'scripts/ci/db-lanes/exclusions.json'));
    const file = `apps/web/e2e/${spec}.spec.ts`;
    const reason = exclusions.find(entry => entry.file === file)?.reason;
    assert.match(reason, prerequisites);
    assert.doesNotMatch(reason, /running web application/u);
  });
}

test('records the dedicated runners required by new browser database proofs', () => {
  const exclusions = readExclusions(join(repoRoot, 'scripts/ci/db-lanes/exclusions.json'));
  for (const [file, prerequisites] of [
    ['apps/web/e2e-mac/closed-services.spec.ts', /Mac.*seeded.*mail catcher/u],
    ['apps/web/e2e/gate/claim-correspondence.spec.ts', /Playwright.*seeded.*PDF uploads/u],
    [
      'apps/web/e2e/gate/one-door-anonymous-leads.spec.ts',
      /Playwright.*seeded.*lead.*reservation/u,
    ],
    ['apps/web/e2e/gate/pilot-deployment-env.spec.ts', /standalone.*gate-ks-sq.*disposable/u],
  ]) {
    assert.match(exclusions.find(entry => entry.file === file)?.reason, prerequisites, file);
  }
});

test('discovers a newly tracked orphan independently of advisory selectors', t => {
  const root = scratch(t);
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-q');
  const orphan = 'packages/other/test/new-db.test.ts';
  const rlsSpec = 'packages/domain-claims/src/rls.spec.ts';
  const suffixedRlsSpec = 'packages/domain-claims/src/adminrls.spec.ts';
  const script = 'scripts/pilot/opt-in.test.ts';
  const auth = 'apps/web/src/lib/auth/opt-in.contract.test.ts';
  const fixture = 'packages/other/test/support.ts';
  const untracked = 'packages/other/test/not-in-ci.test.ts';
  const futureWeb = 'apps/web/src/app/[locale]/(staff)/new.rls.test.ts';
  const futureDomain = 'packages/domain-claims/src/accepted.postgres.test.ts';
  const tracked = [
    orphan,
    rlsSpec,
    suffixedRlsSpec,
    script,
    auth,
    fixture,
    futureWeb,
    futureDomain,
  ];
  for (const file of [...tracked, untracked]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), '');
  }
  writeFileSync(
    join(root, script),
    "test('live proof', { skip: process.env.LIVE_DB_PROOF !== '1' });"
  );
  git('add', '--', ...tracked);

  const files = trackedTests(root);
  assert.deepEqual(files, [
    futureWeb,
    auth,
    futureDomain,
    suffixedRlsSpec,
    rlsSpec,
    orphan,
    script,
  ]);
  assert.throws(() => buildInventory(files, [], []), /no CI lane.*new-db\.test\.ts/u);
  assert.throws(
    () => buildInventory(files, [], []),
    /no CI lane.*packages\/domain-claims\/src\/rls\.spec\.ts/u
  );
  assert.throws(
    () => buildInventory(files, [], []),
    /no CI lane.*scripts\/pilot\/opt-in\.test\.ts/u
  );
  const exclusions = [orphan, rlsSpec, suffixedRlsSpec, script].map(file => ({
    ...exception,
    file,
  }));
  const inventory = buildInventory(files, [], exclusions, new Set([futureWeb, auth, futureDomain]));
  assert.deepEqual(
    inventory.map(row => row.lanes),
    [['advisory/vitest-pg16'], ['advisory/vitest-pg16'], ['advisory/vitest-pg16'], [], [], [], []]
  );
});

for (const [label, source, directory = 'scripts/pilot'] of [
  ['element access', "test('live proof', { skip: process.env['LIVE_DB_PROOF'] !== '1' });"],
  [
    'destructuring',
    "const { 'LIVE_DB_PROOF': enabled } = process.env; test('live proof', { skip: enabled !== '1' });",
  ],
  [
    'an environment alias',
    "const env = process.env; test('live proof', { skip: env.LIVE_DB_PROOF !== '1' });",
  ],
  [
    'an environment import',
    "import { env } from 'node:process'; test('live proof', { skip: env.LIVE_DB_PROOF !== '1' });",
  ],
  ['an environment object without a named flag', 'const env = process.env; void env;'],
  ['environment tokens separated by a comment', 'const env = process /* runtime */ .env;'],
  ['an opt-in token outside an environment reference', 'const optInKey = "LIVE_DB_PROOF";'],
  [
    'a restricted client import outside standard test directories',
    'import { db } from "@interdomestik/database/confirmed-ci";',
    'tools/pilot',
  ],
]) {
  test(`reports an orphan for a tracked test with ${label}`, t => {
    const root = scratch(t);
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-q');
    const file = `${directory}/db-opt-in.test.ts`;
    mkdirSync(join(root, dirname(file)), { recursive: true });
    writeFileSync(join(root, file), source);
    git('add', '--', file);
    assert.throws(() => buildInventory(trackedTests(root), [], []), {
      message: `Database tests with no CI lane: ${file}`,
    });
  });
}

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

for (const [label, change, message] of [
  [
    'the staff RLS runner is missing',
    root => rmSync(join(root, 'scripts/run-staff-detail-rls.mjs')),
    /Missing staff detail runner/u,
  ],
  [
    'the billing RLS opt-in is missing',
    root => {
      const file = join(root, 'packages/domain-membership-billing/package.json');
      const manifest = JSON.parse(readFileSync(file, 'utf8'));
      assert.match(manifest.scripts['test:rls'], /^BILLING_RLS_INTEGRATION=1 /u);
      manifest.scripts['test:rls'] = manifest.scripts['test:rls'].replace(
        'BILLING_RLS_INTEGRATION=1 ',
        ''
      );
      writeFileSync(file, JSON.stringify(manifest));
    },
    /Missing BILLING_RLS_INTEGRATION=1/u,
  ],
]) {
  test(`withdraws protected RLS credit when ${label}`, t => {
    const root = scratch(t);
    copyProtectedSelectors(root);
    const warnings = [];
    const select = () =>
      protectedLanes(root, [], [], (lane, error) => warnings.push([lane, error]));
    assert.deepEqual(
      select().map(lane => lane.name),
      ['e2e-gate/RLS', 'e2e-gate/journal-parity']
    );
    assert.deepEqual(warnings, []);

    change(root);

    assert.deepEqual(
      select().map(lane => lane.name),
      ['e2e-gate/journal-parity']
    );
    assert.deepEqual(
      warnings.map(([lane]) => lane),
      ['e2e-gate/RLS']
    );
    assert.match(warnings[0][1].message, message);
  });
}

test('inventories the checked-out selectors', () => {
  const rows = new Map(repositoryInventory().map(row => [row.file, row]));
  for (const [file, lane] of [
    ['packages/database/test/pg16/journal-schema-parity.test.ts', 'e2e-gate/journal-parity'],
    ['packages/database/test/s8-claim-restricted-rls.test.ts', 'e2e-gate/RLS'],
    ['packages/database/test/rls/member-claim-title-rls.test.ts', 'e2e-gate/RLS'],
    ['apps/web/e2e/gate/member-legal-acceptance.spec.ts', 'e2e-gate/playwright'],
    [
      'packages/domain-claims/src/claims/message-integration/public-reply-notification.integration.test.ts',
      'e2e-gate/RLS',
    ],
    ['packages/database/test/claim-correspondence.test.ts', 'e2e-gate/RLS'],
    ['packages/database/test/pilot-switch.test.ts', 'advisory/node-unit'],
    ['packages/domain-membership-billing/test/exchange-rates-port.test.ts', 'e2e-gate/RLS'],
    ['apps/web/src/lib/refusal-audit-rls.integration.test.ts', 'e2e-gate/RLS'],
    [
      'apps/web/src/features/claims/tracking/server/trackingLifecycle.integration.test.ts',
      'advisory/vitest-pg16',
    ],
    ['packages/domain-users/src/admin/get-users.rls.test.ts', 'advisory/vitest-pg16'],
    ['packages/database/test/access-tenant-rls-migration.test.ts', 'advisory/node-unit'],
    ['packages/database/test/sponsor-foreign-keys.test.ts', 'advisory/node-pg16'],
    [
      'packages/domain-membership-billing/src/paddle-webhooks/handlers/dunning-recovery.postgres.test.ts',
      'advisory/vitest-pg16',
    ],
  ]) {
    assert.ok(rows.get(file)?.lanes.includes(lane), file);
  }
  for (const file of [
    'apps/web/src/lib/auth/better-auth-authority.contract.test.ts',
    'apps/web/src/lib/auth/better-auth-email-otp.contract.test.ts',
    'apps/web/src/lib/auth/different-email-recovery-reset.contract.test.ts',
    'apps/web/src/lib/auth/different-email-recovery-session.contract.test.ts',
    'apps/web/src/lib/auth/different-email-recovery-store.contract.test.ts',
    'apps/web/e2e/gate/claim-correspondence.spec.ts',
    'scripts/pilot/admin-users-unread.test.ts',
  ]) {
    assert.equal(rows.get(file)?.exclusion?.file, file);
    assert.deepEqual(rows.get(file).lanes, [], file);
  }
});
