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
        `repos/interdomestik/interdomestik/actions/workflows/20/runs?event=pull_request&head_sha=${head}`
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

test('workflow lookup permits only the fixed PR event and exact SHA query', () => {
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
    .replaceAll('$(dirname "${BASH_SOURCE[0]}")', `${root}/scripts`);
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
      const result = spawnSync('bash', ['-c', code], {
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
        },
      });
      assert.equal(result.status, scenario.exit, result.stdout + result.stderr);
      assert.equal(Number(fs.readFileSync(counter, 'utf8')), scenario.calls);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
