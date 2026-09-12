import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { hasPendingCheckReplacement } from './actions-check-supersession.mjs';
import { trustedGitHubApiUrl } from './pr-delivery-api.mjs';

const head = 'a'.repeat(40);
const check = { appId: 15368, headSha: head, runId: 10, runAttempt: 1 };
const producer = { id: 10, workflow_id: 20, head_sha: head, event: 'pull_request' };
const active = { ...producer, id: 11, run_attempt: 1, status: 'in_progress' };
function fixture(runs = [active], source = producer, complete = true) {
  return {
    repository: 'interdomestik/interdomestik',
    cached: (_key, loader) => loader(),
    async request(endpoint) {
      assert.equal(endpoint, 'repos/interdomestik/interdomestik/actions/runs/10');
      return source;
    },
    async pages(endpoint, key) {
      assert.equal(key, 'workflow_runs');
      assert.equal(
        endpoint,
        `repos/interdomestik/interdomestik/actions/workflows/20/runs?head_sha=${head}`
      );
      return { values: runs, complete };
    },
  };
}

test('defers an old failed wrapper only for a newer active same-head producer', async () => {
  assert.equal(await hasPendingCheckReplacement(fixture(), check, head), true);
  assert.equal(
    await hasPendingCheckReplacement(fixture([{ ...active, id: 10, run_attempt: 2 }]), check, head),
    true
  );
});

test('feedback producer event families supersede each other on the same workflow and head', async () => {
  const eventNames = ['pull_request', 'pull_request_review', 'pull_request_review_comment'];
  for (const sourceEvent of eventNames) {
    for (const replacementEvent of eventNames) {
      const source = { ...producer, event: sourceEvent };
      const replacement = { ...active, event: replacementEvent };
      assert.equal(
        await hasPendingCheckReplacement(fixture([replacement], source), check, head),
        true,
        `${sourceEvent} should defer to ${replacementEvent}`
      );
    }
  }
});

test('other workflows, heads, events and older attempts cannot defer a failure', async () => {
  for (const change of [
    { workflow_id: 21 },
    { head_sha: 'b'.repeat(40) },
    { event: 'push' },
    { id: 9 },
    { id: 10, run_attempt: 1 },
    { status: 'completed', conclusion: 'failure' },
    { status: 'completed', conclusion: 'success' },
  ]) {
    assert.equal(
      await hasPendingCheckReplacement(fixture([{ ...active, ...change }]), check, head),
      false
    );
  }
  assert.equal(await hasPendingCheckReplacement(fixture([]), check, head), false);
  assert.equal(
    await hasPendingCheckReplacement(
      fixture([active, { ...active, id: 12, status: 'completed', conclusion: 'failure' }]),
      check,
      head
    ),
    false
  );
  assert.equal(await hasPendingCheckReplacement(fixture(), { ...check, appId: 42 }, head), false);
});

test('invalid producer identity and incomplete run enumeration fail closed', async () => {
  for (const source of [
    { ...producer, id: 99 },
    { ...producer, head_sha: 'b'.repeat(40) },
    { ...producer, event: 'push' },
    { ...producer, workflow_id: null },
  ]) {
    await assert.rejects(hasPendingCheckReplacement(fixture([], source), check, head), /identity/);
  }
  await assert.rejects(
    hasPendingCheckReplacement(fixture([active], producer, false), check, head),
    /pagination/
  );
  await assert.rejects(
    hasPendingCheckReplacement(fixture(), { ...check, headSha: 'b'.repeat(40) }, head),
    /identity/
  );
});

test('delivery gate cancels stale feedback and finalizer refreshes on the same events', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const gate = fs.readFileSync(path.join(root, '.github/workflows/pr-delivery-gate.yml'), 'utf8');
  const finalizer = fs.readFileSync(path.join(root, '.github/workflows/pr-finalizer.yml'), 'utf8');

  assert.match(gate, /\non:\n {2}pull_request:\n/u);
  assert.match(gate, /\n {2}pull_request_review:\n {4}types: \[submitted, edited, dismissed\]\n/u);
  assert.match(
    gate,
    /\n {2}pull_request_review_comment:\n {4}types: \[created, edited, deleted\]\n/u
  );

  const gateGroup = gate.match(/ {2}group: (.*)\n/u)[1];
  assert.match(gateGroup, /synchronize-\{0\}.*pull_request\.head\.sha/u);
  assert.match(gateGroup, /format\('event-\{0\}', github\.run_id\)/u);
  assert.match(gateGroup, /format\('feedback-\{0\}', github\.event\.pull_request\.head\.sha\)/u);

  const gateCancel = gate.match(/ {2}cancel-in-progress: (.*)\n/u)[1];
  assert.equal(
    gateCancel,
    "${{ (github.event_name == 'pull_request' && github.event.action == 'synchronize') || github.event_name == 'pull_request_review' || github.event_name == 'pull_request_review_comment' }}",
    'synchronize and both feedback event families must cancel their own obsolete run, unrelated pull_request events must not'
  );

  assert.match(
    finalizer,
    /\n {2}pull_request_review:\n {4}types: \[submitted, edited, dismissed\]\n/u
  );
  assert.match(
    finalizer,
    /\n {2}pull_request_review_comment:\n {4}types: \[created, edited, deleted\]\n/u
  );
  assert.match(
    finalizer,
    /types: \[opened, synchronize, reopened, ready_for_review, converted_to_draft, labeled\]/u
  );
  assert.equal(
    finalizer.match(/ {2}group: (.*)\n/u)[1],
    'pr-finalizer-${{ github.event.pull_request.number }}'
  );
  assert.equal(finalizer.match(/ {2}cancel-in-progress: (.*)\n/u)[1], 'true');

  for (const source of [gate, finalizer]) {
    for (const forbidden of [
      'pull_request_review_thread',
      'workflow_dispatch',
      'actions: write',
      '/rerun',
      'permissions: write-all',
      'checks: write',
    ]) {
      assert.ok(!source.includes(forbidden), `unexpected "${forbidden}" in workflow source`);
    }
  }
});

test('workflow lookup permits exact SHA and rejects unsupported event filters', () => {
  assert.equal(
    trustedGitHubApiUrl(
      `repos/interdomestik/interdomestik/actions/workflows/20/runs?head_sha=${head}`
    ).hostname,
    'api.github.com'
  );
  assert.equal(
    trustedGitHubApiUrl(
      `repos/interdomestik/interdomestik/actions/workflows/20/runs?event=pull_request&head_sha=${head}`
    ).hostname,
    'api.github.com'
  );
  for (const query of ['event=push', 'head_sha=main', 'head_sha=../../other']) {
    assert.throws(
      () =>
        trustedGitHubApiUrl(`repos/interdomestik/interdomestik/actions/workflows/20/runs?${query}`),
      /trusted boundary/
    );
  }
});

test('finalizer refreshes superseded failures, fails genuine failures, and bounds waiting', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const source = fs
    .readFileSync(path.join(root, 'scripts/pr-finalizer.sh'), 'utf8')
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
        cwd: root,
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
          REPLACEMENT_SCRIPT_DIR: path.join(root, 'scripts'),
        },
      });
      assert.equal(result.status, scenario.exit, result.stdout + result.stderr);
      assert.equal(Number(fs.readFileSync(counter, 'utf8')), scenario.calls);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
