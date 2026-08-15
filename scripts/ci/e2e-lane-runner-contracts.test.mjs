import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { playwrightReportArgs } from './playwright-lane-evidence.mjs';

const runner = readFileSync(new URL('../run-e2e-lane.mjs', import.meta.url), 'utf8');
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

test('canonical PR lanes consolidate MK while pilot invocations retain the legacy project', () => {
  assert.match(runner, /pr: gateLane\(\[ksSq, mkContract\], true\)/u);
  assert.match(runner, /'pr-fast': gateLane\(\[ksSq, mkContract\]\)/u);
  assert.match(runner, /gate: gateLane\(\[ksSq, mkMk\], true\)/u);
  assert.match(runner, /'gate-fast': gateLane\(\[ksSq, mkMk\]\)/u);
  assert.match(
    runner,
    /const keepPilotMk =\s*\(laneName === 'pr' \|\| laneName === 'pr-fast'\) &&\s*extraPlaywrightArgs\.some\(arg => arg\.includes\('\/pilot\/'\)\);/u
  );
  assert.match(runner, /if \(keepPilotMk\) lane\.playwrightArgs\.push\(mkMk\)/u);
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
  assert.equal(
    packageJson.scripts['test:ci:contracts'],
    'node --test --test-concurrency=1 scripts/ci/*.test.mjs scripts/check-modularity-guard.test.mjs'
  );
});
