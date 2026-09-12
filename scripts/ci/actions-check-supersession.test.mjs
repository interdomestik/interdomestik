import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { hasPendingCheckReplacement } from './actions-check-supersession.mjs';
import { trustedGitHubApiUrl } from './pr-delivery-api.mjs';

const head = 'a'.repeat(40);
const check = { appId: 15368, headSha: head, runId: 10, runAttempt: 1 };
const runTitle = (event, action) => `PR delivery gate [supersession:v1:${event}:${action}:${head}]`;
const producer = {
  id: 10,
  workflow_id: 20,
  head_sha: head,
  event: 'pull_request',
  display_title: runTitle('pull_request', 'synchronize'),
};
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
      const source = {
        ...producer,
        event: sourceEvent,
        display_title: runTitle(
          sourceEvent,
          sourceEvent === 'pull_request' ? 'synchronize' : 'edited'
        ),
      };
      const replacement = {
        ...active,
        event: replacementEvent,
        display_title: runTitle(
          replacementEvent,
          replacementEvent === 'pull_request' ? 'synchronize' : 'edited'
        ),
      };
      assert.equal(
        await hasPendingCheckReplacement(fixture([replacement], source), check, head),
        true,
        `${sourceEvent} should defer to ${replacementEvent}`
      );
    }
  }
});

test('every configured pull-request snapshot action may supersede another', async () => {
  const actions = [
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
    'converted_to_draft',
    'labeled',
    'review_requested',
    'review_request_removed',
    'closed',
  ];
  for (const sourceAction of actions) {
    for (const replacementAction of actions) {
      const source = {
        ...producer,
        display_title: runTitle('pull_request', sourceAction),
      };
      const replacement = {
        ...active,
        display_title: runTitle('pull_request', replacementAction),
      };
      assert.equal(
        await hasPendingCheckReplacement(fixture([replacement], source), check, head),
        true,
        `${sourceAction} should defer to ${replacementAction}`
      );
    }
  }
});

test('unsupported pull-request actions cannot supersede a failed producer', async () => {
  const unsupported = {
    ...active,
    display_title: runTitle('pull_request', 'assigned'),
  };
  assert.equal(await hasPendingCheckReplacement(fixture([unsupported]), check, head), false);
});

test('full-gate label reruns remain eligible replacement producers', async () => {
  const labeled = {
    ...active,
    display_title: runTitle('pull_request', 'labeled'),
  };
  assert.equal(await hasPendingCheckReplacement(fixture([labeled]), check, head), true);
});

test('exact provider workflows may replace their prior pull-request runs', async () => {
  for (const workflowPath of [
    '.github/workflows/ci.yml',
    '.github/workflows/e2e-pr.yml',
    '.github/workflows/pilot-gate.yml',
  ]) {
    const source = { ...producer, display_title: 'PR lifecycle event', path: workflowPath };
    const replacement = { ...active, display_title: 'PR lifecycle event', path: workflowPath };
    assert.equal(
      await hasPendingCheckReplacement(fixture([replacement], source), check, head),
      true,
      `${workflowPath} should retain its provider replacement contract`
    );
  }
  const source = {
    ...producer,
    display_title: 'PR lifecycle event',
    path: '.github/workflows/ci.yml',
  };
  const replacement = {
    ...active,
    display_title: 'PR lifecycle event',
    path: '.github/workflows/untrusted.yml',
  };
  assert.equal(
    await hasPendingCheckReplacement(fixture([replacement], source), check, head),
    false
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

test('delivery gate cancels stale feedback and finalizer refreshes on the same events', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const gate = fs.readFileSync(path.join(root, '.github/workflows/pr-delivery-gate.yml'), 'utf8');
  const finalizer = fs.readFileSync(path.join(root, '.github/workflows/pr-finalizer.yml'), 'utf8');

  assert.match(
    gate,
    /run-name: 'PR delivery gate \[supersession:v1:\$\{\{ github\.event_name \}\}:\$\{\{ github\.event\.action \}\}:\$\{\{ github\.event\.pull_request\.head\.sha \}\}\]'/u
  );

  assert.match(gate, /\non:\n {2}pull_request:\n/u);
  assert.match(gate, /\n {2}pull_request_review:\n {4}types: \[submitted, edited, dismissed\]\n/u);
  assert.match(
    gate,
    /\n {2}pull_request_review_comment:\n {4}types: \[created, edited, deleted\]\n/u
  );

  const gateGroup = gate.match(/ {2}group: (.*)\n/u)[1];
  assert.equal(
    gateGroup,
    "pr-delivery-gate-${{ github.event.pull_request.number }}-${{ github.event.pull_request.head.sha }}-${{ github.event.pull_request.base.ref == 'main' && github.event.pull_request.state == 'open' && !github.event.pull_request.draft && (github.event.action != 'labeled' || github.event.label.name == 'full-gate') && (github.event.pull_request.head.repo.full_name == github.repository && 'same-repository' || 'fork') || format('deferred-{0}', github.run_id) }}"
  );

  const gateCancel = gate.match(/ {2}cancel-in-progress: (.*)\n/u)[1];
  assert.equal(
    gateCancel,
    'true',
    'all same-origin, same-head snapshot refreshes replace obsolete work'
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
    "pr-finalizer-${{ github.event.pull_request.number }}-${{ github.event.pull_request.head.sha }}-${{ github.event_name != 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && github.event.pull_request.state == 'open' && github.event.pull_request.draft == false && github.event.pull_request.base.ref == 'main' && 'full-feedback' || format('deferred-{0}', github.run_id) }}"
  );
  assert.match(
    finalizer,
    /run-name: 'PR finalizer \[supersession:v1:\$\{\{ github\.event_name \}\}:\$\{\{ github\.event\.action \}\}:\$\{\{ github\.event\.pull_request\.head\.sha \}\}\]'/u
  );
  assert.equal(
    finalizer.match(/ {2}cancel-in-progress: (.*)\n/u)[1],
    'true',
    'trusted same-head refreshes coalesce while the group key isolates fork feedback'
  );

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
