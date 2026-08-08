import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { resolveTurboArgs } from './run-turbo.mjs';

const signatureKey = 'a'.repeat(64);
const repoRoot = process.cwd();
const pullRequestEnv = {
  TURBO_REMOTE_CACHE_SIGNATURE_KEY: signatureKey,
  INTERDOMESTIK_TURBO_REMOTE_CACHE_READ_ONLY: '1',
};

test('turbo wrapper is local-only without the artifact signature key', () => {
  assert.deepEqual(resolveTurboArgs(['lint'], {}), ['lint', '--cache=local:rw']);
  assert.throws(
    () => resolveTurboArgs(['lint', '--cache=remote:r'], {}),
    /require the artifact signature key/u
  );
});

test('turbo wrapper permits remote reads but rejects remote writes on pull requests', () => {
  assert.deepEqual(resolveTurboArgs(['lint'], pullRequestEnv), [
    'lint',
    '--cache=remote:r,local:rw',
  ]);
  assert.deepEqual(resolveTurboArgs(['--verbosity=2', 'run', 'lint'], pullRequestEnv), [
    '--verbosity=2',
    'run',
    'lint',
    '--cache=remote:r,local:rw',
  ]);
  assert.throws(
    () => resolveTurboArgs(['lint', '--cache=remote:rw'], pullRequestEnv),
    /forbids remote writes/u
  );
  assert.throws(() => resolveTurboArgs(['lint', '--remote-only'], pullRequestEnv));
});

test('turbo wrapper keeps signed mainline cache behavior unchanged', () => {
  assert.deepEqual(resolveTurboArgs(['lint'], { TURBO_REMOTE_CACHE_SIGNATURE_KEY: signatureKey }), [
    'lint',
  ]);
});

test('remote-enabled workflows declare the artifact signature secret', () => {
  const workflowDirectory = path.join(repoRoot, '.github/workflows');
  const missingSignature = readdirSync(workflowDirectory)
    .filter(file => /\.ya?ml$/u.test(file))
    .filter(file => {
      const workflow = readFileSync(path.join(workflowDirectory, file), 'utf8');
      return (
        workflow.includes('TURBO_TOKEN:') &&
        (!workflow.includes('TURBO_REMOTE_CACHE_SIGNATURE_KEY:') ||
          !workflow.includes('INTERDOMESTIK_TURBO_REMOTE_CACHE_READ_ONLY:'))
      );
    });

  assert.deepEqual(missingSignature, []);
});

test('pull-request workflows do not expose Turbo cache credentials to checked-out code', () => {
  const workflows = new Map(
    ['ci.yml', 'e2e-pr.yml', 'pilot-gate.yml'].map(file => [
      file,
      readFileSync(path.join(repoRoot, '.github/workflows', file), 'utf8'),
    ])
  );

  assert.doesNotMatch(
    workflows.get('e2e-pr.yml'),
    /secrets\.TURBO_(?:TOKEN|TEAM|REMOTE_CACHE_SIGNATURE_KEY)/u
  );
  assert.match(workflows.get('ci.yml'), /github\.event_name == 'push' && secrets\.TURBO_TOKEN/u);
  assert.match(
    workflows.get('pilot-gate.yml'),
    /github\.event_name == 'workflow_dispatch' && secrets\.TURBO_TOKEN/u
  );
});
