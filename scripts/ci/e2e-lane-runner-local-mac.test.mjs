import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const runnerUrl = new URL('../run-e2e-lane.mjs', import.meta.url);
const head = 'a1'.repeat(20);

// Execute the runner with host preparation, Git and Playwright stubbed out.
const laneProbe = `
  import { registerHooks } from 'node:module';
  Object.defineProperty(process, 'platform', { value: process.env.TEST_PLATFORM });
  const stubs = {
    'node:child_process': \`
      import assert from 'node:assert/strict';
      export function execFileSync(command, args, options) {
        assert.equal(process.platform, 'darwin');
        assert.notEqual(process.env.GITHUB_ACTIONS, 'true');
        assert.equal(command, '/usr/bin/git');
        assert.deepEqual(args, ['rev-parse', '--verify', 'HEAD']);
        assert.equal(options.encoding, 'utf8');
        return '${head}\\\\n';
      }
    \`,
    './ci/ensure-local-test-hosts.mjs': 'export async function ensureLocalTestHosts() {}',
    './ci/run-detached-command.mjs': \`
      import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
      import path from 'node:path';
      export async function runDetachedCommand(command, args, { cwd, env }) {
        if (command !== 'pnpm' || !(args.includes('playwright') || args.includes('e2e:smoke'))) return;
        const report = env.PLAYWRIGHT_JSON_OUTPUT_FILE ?? null;
        const evidenceLane = env.PW_EVIDENCE_LANE ?? null;
        const exitCode = args.includes(env.TEST_FAIL_ARG) ? 17 : 0;
        console.log(JSON.stringify({ args, report, evidenceLane, ci: env.CI }));
        if (report && env.TEST_REPORT_ROOT) {
          const fixturePath = file => {
            const relative = path.relative(cwd, file);
            if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('output outside the worktree');
            return path.join(env.TEST_REPORT_ROOT, relative);
          };
          const outputArg = args.findLast(arg => arg.startsWith('--output='));
          const outputDir = fixturePath(
            outputArg?.slice('--output='.length) ?? path.join(cwd, 'apps/web/test-results/artifacts')
          );
          // Playwright clears the selected output directory before running tests.
          rmSync(outputDir, { recursive: true, force: true });
          mkdirSync(outputDir, { recursive: true });
          const attachments = [];
          if (exitCode) {
            const trace = path.join(outputDir, 'trace.zip');
            writeFileSync(trace, 'failed gate trace');
            attachments.push({ name: 'trace', contentType: 'application/zip', path: trace });
          }
          const suites = [{ specs: [{ tests: [{ results: [{ attachments }] }] }] }];
          const file = fixturePath(report);
          mkdirSync(path.dirname(file), { recursive: true });
          writeFileSync(file, JSON.stringify({ exitCode, suites }));
        }
        if (exitCode) throw Object.assign(new Error('fixture Playwright failure'), { exitCode });
      }
    \`,
  };
  registerHooks({
    resolve(specifier, context, nextResolve) {
      return nextResolve(Object.hasOwn(stubs, specifier)
        ? 'data:text/javascript,' + encodeURIComponent(stubs[specifier])
        : specifier, context);
    },
  });
`;

const preload = `data:text/javascript,${encodeURIComponent(laneProbe)}`;

function probeLane(lane, { platform = 'darwin', hosted = false, ci = '', env = {} } = {}) {
  const result = spawnSync(
    process.execPath,
    ['--import', preload, fileURLToPath(runnerUrl), lane],
    {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        TEST_PLATFORM: platform,
        GITHUB_ACTIONS: hosted ? 'true' : 'false',
        CI: ci,
        SKIP_DOCKER_DOCTOR: '1',
        BETTER_AUTH_SECRET: 'fixture-value-for-lane-contract-tests-only',
        ...env,
      },
    }
  );
  const invocations = result.stdout
    .split('\n')
    .filter(line => line.startsWith('{'))
    .map(JSON.parse);
  return { ...result, invocations };
}

test('only the local Mac full gate uses a cap of 10', () => {
  const macLanes = {
    state: [1],
    gate: [1, 10],
    pr: [1, 1],
    'pr-ks': [1, 1],
    'pr-mk-contract': [1, 1],
    'pr-smoke': [null],
    'gate-fast': [1],
    'pr-fast': [1],
    merge: [null],
    'merge-fast': [null],
    'smoke-ida': [1],
    ks: [1],
    mk: [1],
    'ks-fast': [1],
    'mk-fast': [1],
    'front-door': [1],
  };
  const cases = [
    ...Object.entries(macLanes).map(([lane, caps]) => ({ lane, caps, platform: 'darwin' })),
    { lane: 'gate', caps: [1, 1], platform: 'darwin', hosted: true },
    { lane: 'gate', caps: [1, 1], platform: 'linux' },
  ];
  for (const { lane, caps, platform, hosted } of cases) {
    const label = `${lane} (${platform}${hosted ? ', hosted' : ''})`;
    const result = probeLane(lane, { platform, hosted });
    assert.equal(result.status, 0, `${label}: ${result.stderr}`);
    const expected = caps.map(cap => (cap === null ? [] : [`--max-failures=${cap}`]));
    const actual = result.invocations.map(({ args }) =>
      args.filter(arg => /^--max-failures(?:=|$)|^-x$/.test(arg))
    );
    assert.deepEqual(actual, expected, label);
  }
});

const playwrightCommand = ['--filter', '@interdomestik/web', 'exec', 'playwright', 'test'];
const setupProjects = ['e2e/setup.state.spec.ts', '--project=setup-ks', '--project=setup-mk'];
const gateProjects = ['--project=gate-ks-sq', '--project=gate-mk-mk'];
const gatePaths = ['e2e/gate', 'e2e/security'];
const smokeCommand = ['--filter', '@interdomestik/web', 'run', 'e2e:smoke'];
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const strictArgs = [
  '--workers=1',
  '--max-failures=1',
  '--trace=retain-on-failure',
  '--reporter=line',
];

test('hosted and Linux setup, gate and smoke preserve their existing arguments', () => {
  const cases = [
    { platform: 'darwin', hosted: true },
    { platform: 'linux', hosted: true },
    { platform: 'linux', hosted: false },
  ];
  const setup = [...playwrightCommand, ...setupProjects, ...strictArgs];
  const gate = [...playwrightCommand, ...gatePaths, ...strictArgs, ...gateProjects];
  const hostedSmoke = [
    ...playwrightCommand,
    '--grep',
    '@smoke',
    '--project=ks-sq',
    '--project=mk-mk',
    '--workers=1',
  ];
  for (const { platform, hosted } of cases) {
    for (const [lane, expected] of Object.entries({
      state: [setup],
      gate: [setup, gate],
      smoke: [smokeCommand],
      'pr-smoke': [hostedSmoke],
    })) {
      const result = probeLane(lane, { platform, hosted, ci: 'true' });
      const label = `${lane} (${platform}, hosted=${hosted})`;
      assert.equal(result.status, 0, `${label}: ${result.stderr}`);
      assert.deepEqual(
        result.invocations,
        expected.map(args => ({ args, report: null, evidenceLane: null, ci: 'true' })),
        label
      );
    }
  }
});

test('local Mac setup, full gate and smoke use zero retries and one worker with any CI value', () => {
  const localArgs = ['--retries=0', '--workers=1', '--reporter=line,json'];
  const setup = [
    ...playwrightCommand,
    ...setupProjects,
    '--max-failures=1',
    '--trace=retain-on-failure',
    ...localArgs,
  ];
  const gate = [
    ...playwrightCommand,
    ...gatePaths,
    '--max-failures=10',
    '--trace=retain-on-failure',
    ...gateProjects,
    ...localArgs,
  ];
  const reportRoot = path.join(repoRoot, '.tmp/playwright/local-mac', head);
  for (const ci of ['', 'true', 'false']) {
    const paths = [];
    for (const [lane, expected] of Object.entries({
      state: [setup],
      gate: [setup, gate],
      smoke: [[...smokeCommand, ...localArgs]],
    })) {
      const result = probeLane(lane, { ci, env: { PW_EVIDENCE_LANE: 'pr-gate' } });
      assert.equal(result.status, 0, `${lane}: ${result.stderr}`);
      assert.equal(result.invocations.length, expected.length, lane);
      for (const [
        index,
        { args, report, evidenceLane, ci: actualCi },
      ] of result.invocations.entries()) {
        assert.equal(actualCi, ci);
        assert.ok(path.isAbsolute(report), lane);
        const invocationDir = path.dirname(report);
        const name = lane === 'gate' && index === 0 ? 'state' : lane;
        assert.equal(path.basename(report), 'report.json');
        assert.equal(path.dirname(invocationDir), reportRoot);
        assert.equal(evidenceLane, 'default');
        assert.ok(path.basename(invocationDir).startsWith(`${name}-`), lane);
        assert.deepEqual(
          args,
          [...expected[index], `--output=${path.join(invocationDir, 'artifacts')}`],
          lane
        );
        paths.push(report);
      }
    }
    assert.equal(new Set(paths).size, paths.length);
  }
});

test('a failed local Mac gate keeps its report, trace and status through follow-up smoke', t => {
  const temp = mkdtempSync(path.join(tmpdir(), 'e2e-lane-reports-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const env = { TEST_REPORT_ROOT: temp };
  const gate = probeLane('gate', { env: { ...env, TEST_FAIL_ARG: gateProjects[0] } });
  assert.equal(gate.status, 17, gate.stderr);
  const smoke = probeLane('smoke', { env });
  assert.equal(smoke.status, 0, smoke.stderr);
  const gateReport = gate.invocations[1].report;
  const smokeReport = smoke.invocations[0].report;
  assert.notEqual(gateReport, smokeReport);
  const readReport = report =>
    JSON.parse(readFileSync(path.join(temp, path.relative(repoRoot, report)), 'utf8'));
  const failed = readReport(gateReport);
  assert.equal(failed.exitCode, 17);
  const { attachments } = failed.suites[0].specs[0].tests[0].results[0];
  const trace = attachments.find(attachment => attachment.name === 'trace');
  assert.ok(trace, 'the failed gate report must reference a trace');
  assert.equal(readFileSync(trace.path, 'utf8'), 'failed gate trace');
  assert.equal(readReport(smokeReport).exitCode, 0);
  assert.ok(!existsSync(path.join(temp, 'apps/web/test-results')));
});
