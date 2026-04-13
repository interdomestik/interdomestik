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

function listToolsDeclaresTool(source, toolName) {
  return (
    source.includes(`name: '${toolName}'`) ||
    source.includes(`createNoArgTool('${toolName}'`) ||
    source.includes(`'${toolName}',`)
  );
}

function testsSourceDeclaresSuite(source, suiteName, toolName = suiteName) {
  return (
    source.includes(`${suiteName}: ['${toolName}']`) || source.includes(`suite === '${suiteName}'`)
  );
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
    assert.ok(listToolsDeclaresTool(listToolsSource, toolName));
    assert.ok(routerSource.includes(`${toolName}: () =>`));
  }

  assert.ok(
    listToolsSource.includes(
      'Run the full Phase C verification contract (pr:verify, security:guard, e2e:gate)'
    )
  );
  assert.match(healthSource, /pnpm pr:verify/);
  assert.match(healthSource, /pnpm security:guard/);
  assert.match(healthSource, /pnpm e2e:gate/);

  assert.ok(testsSourceDeclaresSuite(testsSource, 'pr_verify'));
  assert.ok(testsSourceDeclaresSuite(testsSource, 'security_guard'));
  assert.ok(testsSourceDeclaresSuite(testsSource, 'e2e_gate'));
  assert.ok(testsSourceDeclaresSuite(testsSource, 'build_ci'));
  assert.ok(testsSourceDeclaresSuite(testsSource, 'check_fast'));
  assert.ok(testsSourceDeclaresSuite(testsSource, 'e2e_state_setup'));
  assert.ok(testsSourceDeclaresSuite(testsSource, 'e2e_gate_pr_fast'));
  assert.ok(testsSourceDeclaresSuite(testsSource, 'pr_verify_hosts'));
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
    assert.ok(listToolsDeclaresTool(listToolsSource, toolName));
    assert.ok(routerSource.includes(`${toolName}:`));
  }
});
