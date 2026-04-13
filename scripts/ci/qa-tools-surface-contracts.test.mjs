import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('qa tool surface exposes the Phase C verification contract', () => {
  const listToolsSource = readText('packages/qa/src/tools/list-tools.ts');
  const routerSource = readText('packages/qa/src/tool-router.ts');
  const healthSource = readText('packages/qa/src/tools/health.ts');
  const testsSource = readText('packages/qa/src/tools/tests.ts');

  for (const toolName of [
    'pr_verify',
    'security_guard',
    'e2e_gate',
    'build_ci',
    'check_fast',
    'e2e_state_setup',
    'e2e_gate_pr_fast',
    'pr_verify_hosts',
  ]) {
    assert.match(listToolsSource, new RegExp(`name: '${toolName}'`));
    assert.match(routerSource, new RegExp(`${toolName}: \\(\\) =>`));
  }

  assert.match(
    listToolsSource,
    new RegExp(
      String.raw`Run the full Phase C verification contract \(pr:verify, security:guard, e2e:gate\)`
    )
  );
  assert.match(healthSource, /pnpm pr:verify/);
  assert.match(healthSource, /pnpm security:guard/);
  assert.match(healthSource, /pnpm e2e:gate/);

  assert.match(testsSource, /suite === 'pr_verify'/);
  assert.match(testsSource, /suite === 'security_guard'/);
  assert.match(testsSource, /suite === 'e2e_gate'/);
  assert.match(testsSource, /suite === 'build_ci'/);
  assert.match(testsSource, /suite === 'check_fast'/);
  assert.match(testsSource, /suite === 'e2e_state_setup'/);
  assert.match(testsSource, /suite === 'e2e_gate_pr_fast'/);
  assert.match(testsSource, /suite === 'pr_verify_hosts'/);
});

test('qa tool router and list expose the same contract-oriented orchestration tools', () => {
  const listToolsSource = readText('packages/qa/src/tools/list-tools.ts');
  const routerSource = readText('packages/qa/src/tool-router.ts');

  for (const toolName of [
    'check_health',
    'tests_orchestrator',
    'pr_verify',
    'security_guard',
    'e2e_gate',
    'build_ci',
    'check_fast',
    'e2e_state_setup',
    'e2e_gate_pr_fast',
    'pr_verify_hosts',
  ]) {
    assert.match(listToolsSource, new RegExp(`name: '${toolName}'`));
    assert.match(routerSource, new RegExp(`${toolName}:`));
  }
});
