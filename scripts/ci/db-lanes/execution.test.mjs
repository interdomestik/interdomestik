import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkExecution, readExecution } from './execution.mjs';
import {
  copyLaneRunner,
  copyProtectedSelectors,
  scratch,
  updateWorkflow,
} from './inventory-fixture.mjs';
import { buildInventory, repoRoot } from './inventory.mjs';
import { protectedLanes } from './protected-lanes.mjs';

const selected = 'packages/database/test/proof.test.ts';
const passed = {
  file: selected,
  passed: 1,
  failed: 0,
  skipped: 0,
  todo: 0,
  cancelled: 0,
  retried: 0,
};

test('requires nonempty per-file results for the exact selection', () => {
  assert.deepEqual(checkExecution([selected], { complete: true, files: [passed] }), []);
  assert.match(checkExecution([], { complete: true, files: [] }).join(), /empty selection/u);
  assert.match(checkExecution([selected], { complete: true, files: [] }).join(), /missing result/u);
  const unrelated = { ...passed, file: 'another.test.ts' };
  assert.match(
    checkExecution([selected], { complete: true, files: [passed, unrelated] }).join(),
    /unexpected result/u
  );
  assert.match(
    checkExecution([selected], { complete: true, files: [passed, passed] }).join(),
    /duplicate result/u
  );
});

test('refuses incomplete, skipped, TODO, retried, or zero-case results', () => {
  assert.match(
    checkExecution([selected], { complete: false, files: [passed] }).join(),
    /incomplete/u
  );
  for (const key of ['failed', 'skipped', 'todo', 'cancelled', 'retried']) {
    const report = { complete: true, files: [{ ...passed, [key]: 1 }] };
    assert.match(checkExecution([selected], report).join(), new RegExp(`\\b${key}\\b`, 'u'));
  }
  assert.match(
    checkExecution([selected], { complete: true, files: [{ ...passed, passed: 0 }] }).join(),
    /no passing cases/u
  );
});

test('rejects missing, blank, malformed and valid-but-empty reports', t => {
  const root = mkdtempSync(join(tmpdir(), 'db-lanes-evidence-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const filename = join(root, 'report.json');
  assert.throws(() => readExecution(filename), /missing/u);
  for (const [contents, expected] of [
    [' ', /empty/u],
    ['{', /invalid JSON/u],
    ['{}', /invalid shape/u],
  ]) {
    writeFileSync(filename, contents);
    assert.throws(() => readExecution(filename), expected);
  }
});

test('a real Node run reports cases per file and gives a testless file no credit', t => {
  const root = mkdtempSync(join(tmpdir(), 'db-lanes-node-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  writeFileSync(join(root, 'pass.mjs'), "import test from 'node:test'; test('pass', () => {});");
  writeFileSync(join(root, 'empty.mjs'), '');
  const module = new URL('./execution.mjs', import.meta.url).href;
  writeFileSync(
    join(root, 'run.mjs'),
    `import { nodeExecution } from ${JSON.stringify(module)};
    console.log(JSON.stringify(await nodeExecution(import.meta.dirname, ['pass.mjs', 'empty.mjs'], [])));`
  );
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const output = execFileSync(process.execPath, [join(root, 'run.mjs')], { env, encoding: 'utf8' });
  const report = JSON.parse(output);
  assert.deepEqual(report.files, [{ ...passed, file: 'pass.mjs' }]);
  assert.match(
    checkExecution(['pass.mjs', 'empty.mjs'], report).join(),
    /missing result.*empty\.mjs/u
  );
});

test('a real Vitest run records skips, TODOs and retries even when Vitest exits zero', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'db-lanes-vitest-test-')));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const filename = join(root, 'report.json');
  const config = join(root, 'vitest.config.mjs');
  writeFileSync(config, 'export default {};');
  writeFileSync(
    join(root, 'cases.test.mjs'),
    `
    let attempts = 0;
    test('ordinary', () => {});
    test.skip('skipped', () => {});
    test.todo('planned');
    test('retry', { retry: 1 }, () => {
      if (++attempts === 1) throw new Error('synthetic first-attempt failure');
    });
  `
  );
  const run = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      '--root',
      root,
      '--config',
      config,
      '--globals',
      '--retry=0',
      '--reporter',
      join(import.meta.dirname, 'vitest-reporter.mjs'),
    ],
    {
      cwd: join(repoRoot, 'packages/domain-users'),
      env: { ...process.env, DB_LANES_ROOT: root, DB_LANES_REPORT: filename },
      stdio: 'ignore',
    }
  );
  assert.equal(run.status, 0);
  const report = readExecution(filename);
  assert.deepEqual(report, {
    complete: true,
    files: [{ ...passed, file: 'cases.test.mjs', passed: 2, skipped: 1, todo: 1, retried: 1 }],
  });
  assert.equal(checkExecution(['cases.test.mjs'], report).length, 3);
});

test('live database proofs without a database suffix use PG16 when protected credit is absent', () => {
  const live = [
    'cash-resubmit-concurrency',
    'claim-information-requests',
    'critical-rls-tables',
    'domain-event-relay-selection',
    'e2e-runtime-role-grants',
    'e2e-runtime-role-posture',
    'exchange-rate-verifications',
    'exchange-rates',
    'free-start-drafts-repository',
    'member-notes-restricted-rls-changes',
    'member-notes-restricted-rls-races',
    'rls-coverage',
    'rls-engaged',
    'runtime-attestation-enrol',
    'runtime-authority-observation',
    's8-claim-restricted-rls-concurrency',
    'seed-assert-branch-membership-sql',
    'staff-assignment-audit',
    'tenant-transaction-lifetime',
  ].map(name => `packages/database/test/${name}.test.ts`);
  const staticCheck = 'packages/database/test/free-start-drafts-migration.test.ts';
  assert.deepEqual(buildInventory([...live, staticCheck], [], []), [
    ...live.map(file => ({ file, lanes: ['advisory/node-pg16'] })),
    { file: staticCheck, lanes: ['advisory/node-unit'] },
  ]);
});

test('advisory staff proofs receive the restricted fixture and report every passing case', t => {
  const root = scratch(t);
  copyProtectedSelectors(root);
  mkdirSync(join(root, 'scripts/ci'));
  copyLaneRunner(root);
  updateWorkflow(root, ({ jobs }) => {
    jobs['e2e-gate'].steps.find(step => step.name === 'RLS Integration Test').if = false;
  });
  const directory = 'scripts/ci/db-lanes';
  const staff = [
    'apps/web/src/actions/membership-billing/record-rate-verification.rls.test.ts',
    'apps/web/src/app/[locale]/(staff)/staff/claims/[id]/staff-detail-rls.integration.test.ts',
    'apps/web/src/features/admin/branches/branch-dashboard-rls.integration.test.ts',
    'apps/web/src/lib/refusal-audit-rls.integration.test.ts',
  ];
  const ordinary = 'apps/web/src/lib/ordinary.integration.test.ts';
  const nodeProof = 'packages/database/test/claim-information-requests.test.ts';
  const exempt = 'scripts/exempt.rls.test.ts';
  const staffProof = `import assert from 'node:assert/strict';
    import { test } from 'vitest';
    test('uses the provisioned login and disposable admin', () => {
      assert.equal(process.env.E2E_DATABASE_URL, process.env.DATABASE_URL);
      assert.equal(new URL(process.env.DATABASE_URL_RLS).username, 'interdomestik_e2e_runtime');
      assert.equal(process.env.REQUIRE_RLS_INTEGRATION, '1');
      assert.equal(process.env.S8_STAFF_DETAIL_DB_PROOF, '1');
      assert.equal(process.env.DB_MAX_CONNECTIONS, '1');
      assert.match(process.env.S8_STAFF_DETAIL_RUN_TOKEN, /^[a-f0-9]{16}$/u);
      assert.equal(typeof globalThis.document, 'undefined');
    });`;
  const fixtures = new Map([
    ...staff.map(file => [file, staffProof]),
    [
      ordinary,
      `import assert from 'node:assert/strict';
      import { test } from 'vitest';
      test('does not receive the staff credentials', () => {
        assert.equal(process.env.E2E_DATABASE_URL, undefined);
        assert.equal(process.env.DATABASE_URL_RLS, undefined);
      });`,
    ],
    [
      nodeProof,
      `import assert from 'node:assert/strict';
      import test from 'node:test';
      test('receives mandatory PostgreSQL setup', () => {
        assert.equal(new URL(process.env.DATABASE_URL).pathname, '/interdomestik_test');
        assert.equal(process.env.REQUIRE_RLS_INTEGRATION, '1');
        assert.equal(process.env.REQUIRE_RLS_COVERAGE, '1');
        assert.equal(process.env.REQUIRE_DOMAIN_EVENT_RELAY_SQL_PROOF, '1');
      });`,
    ],
    ...protectedLanes(root, [], [], () => {}).flatMap(lane => lane.files.map(file => [file, ''])),
    [exempt, ''],
    [
      `${directory}/exclusions.json`,
      JSON.stringify([
        { file: exempt, reason: 'Fixture', owner: 'Database', removeWhen: 'Fixture is removed' },
      ]),
    ],
  ]);
  for (const [file, source] of fixtures) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  }
  for (const directory of ['.', 'apps/web']) {
    symlinkSync(join(repoRoot, directory, 'node_modules'), join(root, directory, 'node_modules'));
  }
  writeFileSync(
    join(root, 'apps/web/vitest.config.mjs'),
    'export default { test: { environment: "jsdom" } };'
  );
  writeFileSync(
    join(root, 'scripts/e2e-runtime-role.mjs'),
    `
    import assert from 'node:assert/strict';
    export function describeRuntimeRoleFailure(error) { return error.message; }
    export async function provisionE2eRuntimeRole({ adminUrl, runtimeUrl }) {
      assert.equal(adminUrl, process.env.DATABASE_URL);
      assert.equal(runtimeUrl, undefined);
      const url = new URL(adminUrl);
      url.username = 'interdomestik_e2e_runtime';
      return url.href;
    }
  `
  );
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-q');
  git('add', '--', ...fixtures.keys());

  const env = {
    ...process.env,
    CI: 'true',
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test',
  };
  for (const key of [
    'NODE_TEST_CONTEXT',
    'DATABASE_URL_RLS',
    'E2E_DATABASE_URL',
    'E2E_SERVER_DATABASE_URL_RLS',
  ]) {
    delete env[key];
  }
  const run = spawnSync(process.execPath, [`${directory}/run.mjs`, 'pg16'], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  const reports = run.stdout
    .trim()
    .split('\n')
    .filter(line => line.startsWith('{'))
    .map(JSON.parse);
  const report = reports.find(result => result.lane === 'advisory/vitest-staff-rls');
  assert.ok(report, run.stdout + run.stderr);
  assert.deepEqual(checkExecution(staff, report), []);
  assert.deepEqual(
    checkExecution(
      [nodeProof],
      reports.find(result => result.lane === 'advisory/node-pg16')
    ),
    []
  );
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
