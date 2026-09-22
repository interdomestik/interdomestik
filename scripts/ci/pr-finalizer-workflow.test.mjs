import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function readWorkflow(relativePath) {
  return yaml.load(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

test('PR finalizer keeps the required app context as a compatibility-only lifecycle job', () => {
  const workflow = readWorkflow('.github/workflows/pr-finalizer.yml');
  assert.deepEqual(Object.keys(workflow.on), ['pull_request']);
  assert.deepEqual(workflow.on.pull_request.types, [
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
    'converted_to_draft',
    'labeled',
  ]);
  assert.equal(
    workflow['run-name'],
    'PR finalizer [supersession:v1:${{ github.event_name }}:${{ github.event.action }}:${{ github.event.pull_request.head.sha }}]'
  );
  assert.equal(
    workflow.concurrency.group,
    'pr-finalizer-${{ github.event.pull_request.number }}-${{ github.event.pull_request.head.sha }}'
  );
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
  const job = workflow.jobs['pr-finalizer'];
  assert.equal(job.name, 'pr-finalizer');
  assert.equal(job.if, undefined);
  assert.deepEqual(job.permissions, {});
  assert.equal(job['timeout-minutes'], 5);
});

test('hosted PR finalizer publishes no polling, feedback, checkout, or review evaluator', () => {
  const workflow = readWorkflow('.github/workflows/pr-finalizer.yml');
  const source = fs.readFileSync(path.join(rootDir, '.github/workflows/pr-finalizer.yml'), 'utf8');
  const steps = workflow.jobs['pr-finalizer'].steps;
  assert.equal(steps.length, 1);
  assert.equal(steps[0].name, 'Publish required compatibility context');
  assert.equal(steps[0].env.EXPECTED_HEAD_SHA, '${{ github.event.pull_request.head.sha }}');
  assert.equal(steps[0].env.EXPECTED_PR_NUMBER, '${{ github.event.pull_request.number }}');
  assert.match(steps[0].run, /delivery-gate is the authoritative PR decision/u);
  for (const forbidden of [
    'actions/checkout',
    'pr-feedback-setup',
    'scripts/pr-finalizer.sh',
    'PR_FINALIZER_SKIP_CHECK_POLLING',
    'PR_FINALIZER_MAX_CHECK_RETRIES',
    'GITHUB_TOKEN',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden, 'u'));
  }
});

test('PR finalizer delegates Sonar validation to governance monitoring in CI', () => {
  const finalizerLib = fs.readFileSync(path.join(rootDir, 'scripts/pr-finalizer-lib.sh'), 'utf8');

  assert.match(finalizerLib, /Sonar state is reported by governance monitoring/);
  assert.match(finalizerLib, /\$\{GITHUB_ACTIONS:-\}" == "true"/);
});

test('local finalizer refreshes superseded failures, fails genuine failures, and bounds waiting', () => {
  const head = 'a'.repeat(40);
  const source = fs
    .readFileSync(path.join(rootDir, 'scripts/pr-finalizer.sh'), 'utf8')
    .split('\nif [[ "${1:-}" == "--help"')[0]
    .replaceAll('$(dirname "${BASH_SOURCE[0]}")', '${REPLACEMENT_SCRIPT_DIR}');
  const old = {
    name: 'audit',
    app: { id: 15368 },
    head_sha: head,
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-09-07T00:00:00Z',
  };
  const next = { ...old, conclusion: 'success', started_at: '2026-09-07T00:01:00Z' };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'check-supersession-'));
  try {
    for (const scenario of [
      { pending: true, success: true, exit: 0, calls: 2 },
      { pending: false, success: false, exit: 1, calls: 1 },
      { pending: true, success: false, exit: 1, calls: 2 },
    ]) {
      const counter = path.join(directory, 'calls');
      fs.writeFileSync(counter, '0');
      const code = `${source}
required_check_records() { printf 'audit\\t15368\\n'; }
defer_async_generators() { :; }
sleep() { :; }
node() {
  [[ "$1" == scripts/ci/actions-check-supersession.mjs ]] || return 99
  cat >/dev/null
  printf '${scenario.pending}\\n'
}
gh() {
  if [[ "$*" == *'/pulls/'* ]]; then
    printf '%s' '{"head":{"sha":"${head}"}}'
    return
  fi
  count="$(cat "$REPLACEMENT_COUNTER")"
  printf '%s' "$((count + 1))" > "$REPLACEMENT_COUNTER"
  if [[ "$count" -gt 0 && '${scenario.success}' == true ]]; then
    printf '%s' '${JSON.stringify([{ check_runs: [next] }])}'
  else
    printf '%s' '${JSON.stringify([{ check_runs: [old] }])}'
  fi
}
require_gh_checks
`;
      const harness = path.join(directory, 'harness.sh');
      fs.writeFileSync(harness, code, { mode: 0o600 });
      const result = spawnSync('bash', ['--', harness], {
        cwd: rootDir,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          GITHUB_ACTIONS: 'false',
          GH_TOKEN: 'fixture',
          PR_NUMBER: '1695',
          GITHUB_REPOSITORY: 'interdomestik/interdomestik',
          PR_FINALIZER_SKIP_CHECK_POLLING: '',
          PR_FINALIZER_MAX_CHECK_RETRIES: '2',
          REPLACEMENT_COUNTER: counter,
          REPLACEMENT_SCRIPT_DIR: path.join(rootDir, 'scripts'),
        },
      });
      assert.equal(result.status, scenario.exit, result.stdout + result.stderr);
      assert.equal(Number(fs.readFileSync(counter, 'utf8')), scenario.calls);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
