import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function source(file) {
  return fs.readFileSync(file, 'utf8');
}

test('all untrusted-path policy CLIs use the shared trusted-file boundary', () => {
  const clis = [
    'scripts/ci/github-pr-files.mjs',
    'scripts/ci/pr-gate-policy.mjs',
    'scripts/ci/policy-cli-common-lib.mjs',
    'scripts/ci/ai-eval-surface.mjs',
  ];

  for (const cli of clis) {
    const script = source(cli);
    assert.match(script, /trustedRunnerFile/);
    assert.match(script, /from '\.\/trusted-runner-file\.mjs'/);
  }
});

test('Z620 validation passes its task-owned temp directory as RUNNER_TEMP', () => {
  const script = source('scripts/ci/z620-validation-surface.mjs');

  assert.match(script, /env:\s*\{\s*\.\.\.process\.env,\s*RUNNER_TEMP:\s*tempDir\s*\}/s);
});

test('PR finalizer creates a private root and passes it to policy CLIs', () => {
  const script = source('scripts/pr-finalizer-lib.sh');

  assert.match(script, /changed_files_root="\$\(mktemp -d .*pr-finalizer\.XXXXXX"\)"/);
  assert.match(
    script,
    /RUNNER_TEMP="\$\{RUNNER_TEMP:-\$\{changed_files_root\}\}".*github-pr-files\.mjs/s
  );
  assert.match(
    script,
    /RUNNER_TEMP="\$\{RUNNER_TEMP:-\$\{changed_files_root\}\}".*validation-surface-policy\.mjs/s
  );
  assert.match(script, /rm -rf -- "\$\{changed_files_root\}"/);
});

test('local parity creates and removes a private validation root', () => {
  const script = source('scripts/ci-local-parity.sh');

  assert.match(script, /validation_surface_root="\$\(mktemp -d\)"/);
  assert.match(
    script,
    /RUNNER_TEMP="\$\{validation_surface_root\}".*validation-surface-policy\.mjs/s
  );
  assert.match(script, /rm -rf -- "\$\{validation_surface_root\}"/);
});
