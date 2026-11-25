import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { playwrightReportArgs } from './playwright-lane-evidence.mjs';

const runnerUrl = new URL('../run-e2e-lane.mjs', import.meta.url);
const runner = readFileSync(runnerUrl, 'utf8');
const helper = readFileSync(new URL('run-detached-command.mjs', import.meta.url), 'utf8');
const playwrightConfig = readFileSync(
  new URL('../../apps/web/playwright.config.ts', import.meta.url),
  'utf8'
);
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);

test('E2E lane runner delegates subprocess cleanup to the detached command helper', () => {
  assert.match(runner, /ensureLocalTestHosts/);
  assert.match(runner, /import \{ runDetachedCommand \} from '\.\/ci\/run-detached-command\.mjs'/);
  assert.match(runner, /await runDetachedCommand\(command, args, \{ cwd: rootDir, env \}\)/);
});

test('detached command helper terminates active process groups on exit and cancellation', () => {
  assert.match(helper, /detached: true/);
  assert.match(helper, /stdio: \['ignore', 'inherit', 'inherit'\]/);
  assert.match(helper, /process\.platform === 'win32' \? pid : -pid/);
  assert.match(helper, /process\.kill\(target, signal\)/);
  assert.match(helper, /error\?\.code === 'ESRCH'/);
  assert.match(helper, /process\.once\('exit', \(\) => stopActiveProcessGroups\(\)\)/);
  assert.match(helper, /process\.on\(signal, \(\) => \{/);
  assert.match(helper, /stopActiveProcessGroups\(signal\)/);
});

test('root package script exposes the hardened E2E state setup lane', () => {
  assert.equal(packageJson.scripts['e2e:state:setup'], 'node scripts/run-e2e-lane.mjs state');
});

test('PR verification owns the full gate and orchestration never repeats it or RLS', () => {
  const verify = packageJson.scripts['pr:verify'].split(' && ');
  assert.equal(verify.filter(command => command === 'pnpm db:rls:test:required').length, 1);
  assert.equal(verify.filter(command => command === 'pnpm coverage:gate').length, 1);
  assert.equal(packageJson.scripts['e2e:smoke'], 'node scripts/run-e2e-lane.mjs smoke');
  assert.equal(
    verify.filter(command => command === 'node scripts/run-with-default-db-url.mjs pnpm e2e:smoke')
      .length,
    1
  );
  assert.equal(
    verify.filter(command => command === 'node scripts/run-with-default-db-url.mjs pnpm e2e:gate')
      .length,
    1
  );
  assert.ok(!verify.includes('pnpm check:fast'), 'fast feedback is not a substitute for PR proof');
  const orchestrator = readFileSync(
    new URL('../multi-agent/orchestrator.sh', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(orchestrator, /pnpm (?:db:rls:test:required|e2e:gate)/u);
  assert.equal(orchestrator.match(/pnpm security:guard/gu)?.length, 2);
  assert.equal(orchestrator.match(/pnpm pr:verify:hosts/gu)?.length, 2);
  const verifySlice = readFileSync(
    new URL('../multi-agent/verify-slice.sh', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(verifySlice, /run_gate "e2e-gate"/);
});

test('canonical PR lanes consolidate MK while pilot invocations retain the legacy project', () => {
  // The gate path filter keeps the security specs that GATE_SECURITY_MATCH admits.
  assert.match(runner, /const gatePaths = \['e2e\/gate', 'e2e\/security'\];/u);
  assert.match(runner, /playwrightArgs: \[\.\.\.gatePaths, \.\.\.runnerArgs, \.\.\.projects\]/u);
  assert.match(runner, /pr: gateLane\(\[ksSq, mkContract\], true\)/u);
  assert.match(runner, /'pr-fast': gateLane\(\[ksSq, mkContract\]\)/u);
  assert.match(runner, /gate: gateLane\(\[ksSq, mkMk\], true, fullGateWorkers\)/u);
  assert.match(runner, /'gate-fast': gateLane\(\[ksSq, mkMk\]\)/u);
  assert.match(
    runner,
    /const keepPilotMk =\s*\(laneName === 'pr' \|\| laneName === 'pr-fast'\) &&\s*extraPlaywrightArgs\.some\(arg => arg\.includes\('\/pilot\/'\)\);/u
  );
  assert.match(runner, /if \(keepPilotMk\) lane\.playwrightArgs\.push\(mkMk\)/u);
});

test('split PR gates retain strict fast setup and smoke retains its package arguments', () => {
  assert.match(runner, /const ksSq = '--project=gate-ks-sq';/u);
  assert.match(runner, /const mkContract = '--project=gate-mk-contract';/u);
  assert.match(runner, /'pr-ks': gateLane\(\[ksSq\], true\)/u);
  assert.match(runner, /'pr-mk-contract': gateLane\(\[mkContract\], true\)/u);
  assert.match(runner, /const fastEnv = \{ PW_FAST_GATES: '1' \};/u);
  assert.match(runner, /const strictWorkers = \['--workers=1', \.\.\.strictArgs\];/u);
  assert.match(
    runner,
    /const setupArgs = \['e2e\/setup\.state\.spec\.ts', '--project=setup-ks', '--project=setup-mk'\];/u
  );
  assert.match(
    runner,
    /'pr-smoke': \{\s*gatekeeper: true,\s*playwrightArgs: \['--grep', '@smoke', '--project=ks-sq', '--project=mk-mk', '--workers=1'\],\s*\}/u
  );
});

// Execute the runner with host preparation and subprocesses stubbed out.
const laneProbe = `
  import { registerHooks } from 'node:module';
  Object.defineProperty(process, 'platform', { value: process.env.TEST_PLATFORM });
  const stubs = {
    './ci/ensure-local-test-hosts.mjs': 'export async function ensureLocalTestHosts() {}',
    './ci/run-detached-command.mjs': \`
      import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
      import path from 'node:path';
      export async function runDetachedCommand(command, args, { cwd, env }) {
        if (command !== 'pnpm' || !(args.includes('playwright') || args.includes('e2e:smoke'))) return;
        const report = env.PLAYWRIGHT_JSON_OUTPUT_FILE ?? null;
        const resultsDir = env.PW_LOCAL_MAC_RESULTS_DIR ?? null;
        const exitCode = args.includes(env.TEST_FAIL_ARG) ? 17 : 0;
        console.log(JSON.stringify({ args, report, resultsDir, ci: env.CI }));
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
        expected.map(args => ({ args, report: null, resultsDir: null, ci: 'true' })),
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
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  const reportRoot = path.join(repoRoot, '.tmp/playwright/local-mac', head);
  for (const ci of ['', 'true', 'false']) {
    const paths = [];
    for (const [lane, expected] of Object.entries({
      state: [setup],
      gate: [setup, gate],
      smoke: [[...smokeCommand, ...localArgs]],
    })) {
      const result = probeLane(lane, { ci });
      assert.equal(result.status, 0, `${lane}: ${result.stderr}`);
      assert.equal(result.invocations.length, expected.length, lane);
      for (const [
        index,
        { args, report, resultsDir, ci: actualCi },
      ] of result.invocations.entries()) {
        assert.equal(actualCi, ci);
        assert.ok(path.isAbsolute(report), lane);
        const invocationDir = path.dirname(report);
        const name = lane === 'gate' && index === 0 ? 'state' : lane;
        assert.equal(path.basename(report), 'report.json');
        assert.equal(path.dirname(invocationDir), reportRoot);
        assert.equal(resultsDir, invocationDir);
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

test('an empty or unknown lane is refused before any preparation runs', () => {
  for (const lane of ['', 'pr-unknown']) {
    const result = spawnSync(process.execPath, [runnerUrl.pathname, lane], {
      encoding: 'utf8',
      // If lane selection ever regressed, the too-short secret would stop the runner at secret
      // validation (exit 1), before host preparation, the doctor or the gatekeeper could run.
      env: {
        PATH: process.env.PATH,
        SKIP_DOCKER_DOCTOR: '1',
        BETTER_AUTH_SECRET: 'too-short',
        E2E_DATABASE_URL: 'postgresql://lane-refusal@db.invalid:5432/refused',
      },
    });
    assert.equal(result.status, 2, JSON.stringify(lane));
    assert.match(result.stderr, /Usage: node scripts\/run-e2e-lane\.mjs <lane>/u);
    assert.match(result.stderr, /pr-ks, pr-mk-contract, pr-smoke/u);
  }
});

test('MK contract and non-pilot MK gate preserve the same effective matches', () => {
  assert.match(playwrightConfig, /const GATE_DEFAULT_MATCH = \['gate\/\*\*\/\*\.spec\.ts'\]/u);
  assert.match(
    playwrightConfig,
    /const GATE_MK_CONTRACT_MATCH = \[[\s\S]*\.\.\.GATE_DEFAULT_MATCH,[\s\S]*\.\.\.GATE_SECURITY_MATCH,[\s\S]*'gate\/seed-contract\.spec\.ts',[\s\S]*'gate\/tenant-resolution\.spec\.ts',[\s\S]*\];/u
  );
  assert.match(
    playwrightConfig,
    /const GATE_MK_TEST_MATCH = RUNNING_PILOT_MATRIX[\s\S]*\? \[\.\.\.GATE_DEFAULT_MATCH, \.\.\.GATE_SECURITY_MATCH, \.\.\.GATE_MK_PILOT_MATCH\][\s\S]*: \[\.\.\.GATE_DEFAULT_MATCH, \.\.\.GATE_SECURITY_MATCH\];/u
  );
});

test('Playwright evidence lanes are isolated without moving legacy default reports', () => {
  assert.match(
    playwrightConfig,
    /const REQUESTED_EVIDENCE_LANE = process\.env\.PW_EVIDENCE_LANE \?\? 'default'/u
  );
  assert.match(playwrightConfig, /case 'default':[\s\S]*case 'pr-gate':[\s\S]*case 'pr-smoke':/u);
  assert.match(playwrightConfig, /case 'default':\s*EVIDENCE_LANE = ''/u);
  assert.match(playwrightConfig, /throw new Error\('PW_EVIDENCE_LANE_INVALID'\)/u);
  assert.match(playwrightConfig, /'test-results', EVIDENCE_LANE/u);
  assert.match(playwrightConfig, /'playwright-report', EVIDENCE_LANE/u);
  assert.match(playwrightConfig, /outputDir: path\.join\(TEST_RESULTS_DIR, 'artifacts'\)/u);
});

test('only safe evidence lanes defer to configured Playwright reporters', () => {
  const defaultArgs = ['--trace=retain-on-failure', '--reporter=line'];
  assert.deepEqual(playwrightReportArgs(undefined), defaultArgs);
  assert.deepEqual(playwrightReportArgs('../unsafe'), defaultArgs);
  assert.deepEqual(playwrightReportArgs('pr-gate'), ['--trace=retain-on-failure']);
  assert.match(runner, /playwrightReportArgs\(process\.env\.PW_EVIDENCE_LANE\)/u);
});

test('root package script serializes CI contracts without dropping files', () => {
  // The shard runner's `all` lane: every active contract file in one serialized runner.
  assert.equal(
    packageJson.scripts['test:ci:contracts'],
    'node scripts/ci/contract-test-shards.mjs all'
  );
  for (const mode of ['core', 'guard-trust', 'parallel']) {
    assert.equal(
      packageJson.scripts[`test:ci:contracts:${mode}`],
      `node scripts/ci/contract-test-shards.mjs ${mode}`
    );
  }
});
