import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');

function action(name) {
  return fs.readFileSync(path.join(root, '.github/actions', name, 'action.yml'), 'utf8');
}

function workflow(name) {
  return fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8');
}

test('bootstrap actions execute code only from their immutable action checkout', () => {
  const admission = action('exact-head-certification');
  const result = action('exact-head-certification-result');
  for (const source of [admission, result]) {
    assert.match(source, /POLICY_ROOT: \$\{\{ github\.action_path \}\}\/\.\.\/\.\.\/\.\./u);
    assert.doesNotMatch(source, /run: node scripts\//u);
  }
  assert.match(admission, /GITHUB_RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/u);
});

test('admission exposes fail-closed outputs and one-shot label consumption', () => {
  const source = action('exact-head-certification');
  for (const output of [
    'run_broad',
    'certification_required',
    'consume_full_gate',
    'certification_reason',
  ]) {
    assert.match(source, new RegExp(`  ${output}:`, 'u'));
  }
  assert.equal((source.match(/description:/gu) || []).length >= 6, true);
  assert.match(source, /issues\/\$\{PR_NUMBER\}\/labels\/full-gate/u);
});

test('result enforcement receives only explicit certification evidence', () => {
  const source = action('exact-head-certification-result');
  for (const input of [
    'preflight-result',
    'run-broad',
    'certification-required',
    'certification-reason',
    'runner-result',
  ]) {
    assert.match(source, new RegExp(`  ${input}:`, 'u'));
  }
  assert.match(source, /exact-head-certification-result\.mjs/u);
  assert.match(source, /GITHUB_RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/u);
});

const trustedBootstrap =
  'interdomestik/interdomestik/.github/actions/exact-head-certification@ecd31cf47a5d2fbd6c164aea0c0c6fcfb686011b';

test('all five callers pin exact-head admission to the bootstrap SHA', () => {
  for (const name of [
    'ci.yml',
    'e2e-pr.yml',
    'pilot-gate.yml',
    'pr-deterministic-backstops.yml',
    'pr-finalizer.yml',
  ]) {
    assert.match(workflow(name), new RegExp(trustedBootstrap.replaceAll('.', '\\.'), 'u'), name);
  }
});

test('PR E2E pins result authority and removes its colliding manual trigger', () => {
  const source = workflow('e2e-pr.yml');
  assert.match(
    source,
    /interdomestik\/interdomestik\/\.github\/actions\/exact-head-certification-result@ecd31cf47a5d2fbd6c164aea0c0c6fcfb686011b/u
  );
  assert.doesNotMatch(source, /^  workflow_dispatch:/mu);
  assert.match(source, /if: needs\.e2e-preflight\.outputs\.run_broad == 'true'/u);
});
