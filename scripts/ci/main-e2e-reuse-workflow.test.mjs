import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = yaml.load(readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
const validation = workflow.jobs['validation-surface'];
const e2e = workflow.jobs['e2e-gate'];

function step(job, name) {
  return job.steps.find(value => value?.name === name);
}

test('main CI resolves exact-tree reuse with bounded read-only evidence access', () => {
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.permissions['pull-requests'], 'read');
  assert.equal(workflow.permissions.actions, 'read');

  const resolver = step(validation, 'Resolve main E2E exact-tree reuse');
  assert.ok(resolver);
  assert.equal(resolver.id, 'main_e2e_reuse');
  assert.equal(resolver['continue-on-error'], true);
  assert.equal(resolver.if, "github.event_name == 'push' && github.ref == 'refs/heads/main'");
  assert.equal(resolver.env.GITHUB_TOKEN, '${{ github.token }}');
  assert.equal(resolver.run, 'node scripts/ci/main-e2e-reuse.mjs >> "$GITHUB_OUTPUT"');
  assert.equal(validation.outputs.main_e2e_reuse, '${{ steps.main_e2e_reuse.outputs.reuse }}');
  assert.equal(validation.outputs.main_e2e_reuse_reason, undefined);
});

test('only the main browser suite consumes the exact true reuse decision', () => {
  const suite = step(e2e, 'E2E Gate Suite');
  assert.equal(
    suite.if,
    "github.event_name != 'pull_request' && needs.validation-surface.outputs.main_e2e_reuse != 'true'"
  );
  assert.equal(suite.run, 'pnpm e2e:gate');

  for (const name of [
    'Generate ephemeral E2E credentials',
    'Enforce E2E Best Practices',
    'Prepare E2E Database',
    'RLS Integration Test',
  ]) {
    const candidate = step(e2e, name);
    assert.ok(candidate, name);
    assert.doesNotMatch(candidate.if ?? '', /main_e2e_reuse/u, name);
  }
  const setup = e2e.steps.find(candidate => candidate?.uses === './.github/actions/setup');
  assert.doesNotMatch(setup.if ?? '', /main_e2e_reuse/u);
  assert.equal(e2e.if, "needs.validation-surface.outputs.run_broad == 'true'");
});

test('workflow does not trust the reason output or condition the whole job', () => {
  const source = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.doesNotMatch(step(e2e, 'E2E Gate Suite').if, /main_e2e_reuse_reason/u);
  assert.doesNotMatch(e2e.if, /main_e2e_reuse/u);
  assert.equal((source.match(/main_e2e_reuse != 'true'/gu) ?? []).length, 1);
});
