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

test('PR finalizer refreshes on the same review and review-comment activity as the delivery gate', () => {
  const workflow = readWorkflow('.github/workflows/pr-finalizer.yml');
  assert.deepEqual(Object.keys(workflow.on), [
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment',
  ]);
  assert.deepEqual(workflow.on.pull_request_review.types, ['submitted', 'edited', 'dismissed']);
  assert.deepEqual(workflow.on.pull_request_review_comment.types, ['created', 'edited', 'deleted']);
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
  assert.equal(workflow.concurrency.group, 'pr-finalizer-${{ github.event.pull_request.number }}');
  assert.equal(
    workflow.concurrency['cancel-in-progress'],
    "${{ github.event_name == 'pull_request' && github.event.action == 'synchronize' }}"
  );
  assert.equal(
    workflow.jobs['pr-finalizer'].if,
    "github.event_name == 'pull_request' || (github.event.pull_request.state == 'open' && github.event.pull_request.draft == false && github.event.pull_request.base.ref == 'main' && github.event.pull_request.head.repo.full_name == github.repository)"
  );
});

test('PR finalizer forces current-head required-check polling for the full lane', () => {
  const workflow = readWorkflow('.github/workflows/pr-finalizer.yml');
  assert.deepEqual(workflow.jobs['pr-finalizer'].permissions, {
    contents: 'read',
    actions: 'read',
    'pull-requests': 'read',
    checks: 'read',
    statuses: 'read',
  });
  const checkout = workflow.jobs['pr-finalizer'].steps.find(step =>
    step.uses?.startsWith('actions/checkout@')
  );
  const runStep = workflow.jobs['pr-finalizer'].steps.find(
    step => step?.name === 'Run PR finalizer gate'
  );

  assert.ok(checkout);
  assert.equal(checkout.with['fetch-depth'], 1);
  assert.ok(runStep);
  assert.equal(runStep.run.trim(), 'bash scripts/pr-finalizer.sh');
  assert.equal(runStep.env.PR_FINALIZER_SKIP_CHECK_POLLING, 'false');
  assert.equal(runStep.env.PR_FINALIZER_MAX_CHECK_RETRIES, '360');
  const setup = workflow.jobs['pr-finalizer'].steps.find(step =>
    step.uses?.startsWith('actions/setup-node@')
  );
  assert.equal(setup.with['node-version-file'], '.nvmrc');
  assert.equal(setup.with['package-manager-cache'], false);
  assert.ok(
    workflow.jobs['pr-finalizer'].steps.every(step => step.uses !== './.github/actions/setup'),
    'attestation needs Node and GitHub tools, not application dependencies'
  );
});

test('PR finalizer delegates Sonar validation to governance monitoring in CI', () => {
  const finalizerLib = fs.readFileSync(path.join(rootDir, 'scripts/pr-finalizer-lib.sh'), 'utf8');

  assert.match(finalizerLib, /Sonar state is reported by governance monitoring/);
  assert.match(finalizerLib, /\$\{GITHUB_ACTIONS:-\}" == "true"/);
});

test('finalizer refreshes superseded failures, fails genuine failures, and bounds waiting', () => {
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
