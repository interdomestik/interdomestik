import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validRefresh, repository, base, head, merge } from './pr-feedback-refresh-fixtures.mjs';

const moduleUrl = new URL('./pr-feedback-controller.mjs', import.meta.url);
async function implementation() {
  assert.ok(fs.existsSync(moduleUrl), 'trusted feedback controller is not present');
  return import(moduleUrl);
}
function fixture() {
  const evidence = validRefresh();
  const writes = [];
  let runReads = 0;
  const client = {
    repository,
    async request(endpoint) {
      if (endpoint.endsWith('/actions/workflows/20')) return structuredClone(evidence.workflow);
      if (endpoint.endsWith('/pulls/17')) return structuredClone(evidence.pull);
      if (endpoint.endsWith(`/actions/runs/${evidence.run.id}`)) {
        runReads++;
        return structuredClone(evidence.run);
      }
      if (endpoint.endsWith('/collaborators/maintainer/permission')) return evidence.permission;
      if (endpoint.endsWith('/git/commits/' + merge))
        return { parents: [{ sha: base }, { sha: head }] };
      assert.fail(endpoint);
    },
    async pages(endpoint, key) {
      if (
        endpoint ===
        `repos/${repository}/actions/workflows/20/runs?event=pull_request&head_sha=${'f'.repeat(40)}`
      ) {
        return { values: [], complete: true };
      }
      if (
        endpoint ===
        `repos/${repository}/actions/workflows/20/runs?event=pull_request&head_sha=${head}`
      ) {
        assert.equal(key, 'workflow_runs');
        return { values: [structuredClone(evidence.run)], complete: true };
      }
      if (
        endpoint ===
        `repos/${repository}/actions/runs/${evidence.run.id}/attempts/${evidence.run.run_attempt}/jobs`
      ) {
        assert.equal(key, 'jobs');
        return { values: structuredClone(evidence.jobs), complete: true };
      }
      assert.ok(
        ['/pulls/17/reviews', '/issues/17/comments', '/pulls/17/comments'].some(route =>
          endpoint.endsWith(route)
        ),
        endpoint
      );
      return { values: [], complete: true };
    },
    async graphql() {
      return {
        repository: {
          pullRequest: { reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } } },
        },
      };
    },
    async response(endpoint, options) {
      writes.push({ endpoint, options });
      return { status: 201 };
    },
  };
  return { client, evidence, writes, runReads: () => runReads };
}

test('controller dry-run is read only; apply revalidates before its single exact rerun', async () => {
  const { refreshOne } = await implementation();
  const f = fixture();
  const options = { now: f.evidence.now, apply: false };
  assert.equal(
    (await refreshOne(f.client, 17, f.evidence.workflow, options)).status,
    'would-refresh'
  );
  assert.deepEqual(f.writes, []);
  assert.equal(
    (await refreshOne(f.client, 17, f.evidence.workflow, { ...options, apply: true })).status,
    'refresh-requested'
  );
  assert.ok(f.runReads() >= 3, 'run identity must be reread before applying');
  assert.deepEqual(f.writes, [
    { endpoint: `repos/${repository}/actions/runs/100/rerun`, options: { method: 'POST' } },
  ]);
});

for (const mutation of [
  'closed',
  'new-head',
  'new-attempt',
  'new-run',
  'permission',
  'pagination',
]) {
  test(`controller performs no write when ${mutation} changes before dispatch`, async () => {
    const { refreshOne } = await implementation();
    const f = fixture();
    const request = f.client.request;
    let pullReads = 0;
    f.client.request = async endpoint => {
      if (endpoint.endsWith('/pulls/17') && ++pullReads === 4) {
        if (mutation === 'closed') f.evidence.pull.state = 'closed';
        if (mutation === 'new-head') f.evidence.pull.head.sha = 'f'.repeat(40);
        if (mutation === 'new-attempt') f.evidence.run.run_attempt = 2;
        if (mutation === 'new-run') f.evidence.run.id = 200;
        if (mutation === 'permission') f.evidence.permission.permission = 'read';
      }
      return request(endpoint);
    };
    const pages = f.client.pages;
    f.client.pages = async (...args) => {
      const result = await pages(...args);
      if (mutation === 'pagination') result.complete = false;
      return result;
    };
    await refreshOne(f.client, 17, f.evidence.workflow, { now: f.evidence.now, apply: true }).catch(
      error => {
        assert.match(error.message, /pagination|identity/u);
      }
    );
    assert.deepEqual(f.writes, []);
  });
}

test('ambiguous POST failure is surfaced and never automatically retried', async () => {
  const { refreshOne } = await implementation();
  const f = fixture();
  f.client.response = async () => {
    f.writes.push('attempt');
    throw new Error('transport interrupted');
  };
  await assert.rejects(
    refreshOne(f.client, 17, f.evidence.workflow, { now: f.evidence.now, apply: true }),
    /transport interrupted/u
  );
  assert.deepEqual(f.writes, ['attempt']);
});

test('controller rejects non-main and untrusted invocation before any network activity', async () => {
  const { validateControllerEnvironment } = await implementation();
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_REPOSITORY_ID: '1128472973',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'schedule',
    GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/pr-feedback-refresh.yml@refs/heads/main`,
    GITHUB_SHA: base,
    GITHUB_WORKFLOW_SHA: base,
    GITHUB_TOKEN: 'fixture',
    REFRESH_APPLY: 'true',
  };
  assert.equal(validateControllerEnvironment(env), true);
  for (const [key, value] of [
    ['GITHUB_REF', 'refs/heads/fork'],
    ['GITHUB_EVENT_NAME', 'pull_request_review'],
    ['GITHUB_WORKFLOW_SHA', head],
    ['GITHUB_REPOSITORY_ID', '1'],
  ]) {
    assert.throws(() => validateControllerEnvironment({ ...env, [key]: value }), /runtime/u);
  }
});

test('a native run starting during the final feedback read is not rerun', async () => {
  const { refreshOne } = await implementation();
  const f = fixture();
  const request = f.client.request;
  let reads = 0;
  f.client.request = async endpoint => {
    if (endpoint.endsWith('/pulls/17') && ++reads === 6) f.evidence.run.status = 'in_progress';
    return request(endpoint);
  };
  const result = await refreshOne(f.client, 17, f.evidence.workflow, {
    now: f.evidence.now,
    apply: true,
  });
  assert.equal(result.status, 'selection-changed');
  assert.deepEqual(f.writes, []);
});

for (const lane of ['delivery', 'finalizer']) {
  test(`a proven deferred ${lane} label run cannot hide the latest real gate`, async () => {
    const { refreshOne } = await implementation();
    const f = fixture();
    if (lane === 'finalizer') {
      f.evidence.workflow.path = f.evidence.run.path = '.github/workflows/pr-finalizer.yml';
      f.evidence.run.display_title = `PR finalizer [supersession:v1:pull_request:opened:${head}]`;
      f.evidence.jobs[0].name = 'pr-finalizer';
    }
    const deferred = {
      ...f.evidence.run,
      id: 200,
      conclusion: lane === 'delivery' ? 'skipped' : 'success',
      display_title: f.evidence.run.display_title.replace(':opened:', ':labeled:'),
    };
    const job = {
      id: 201,
      run_id: 200,
      run_attempt: 1,
      status: 'completed',
      conclusion: deferred.conclusion,
      name: lane === 'delivery' ? 'delivery-gate-deferred' : 'pr-finalizer',
      steps: [],
    };
    if (lane === 'finalizer')
      job.steps = [
        'Run actions/checkout@v5',
        'Evaluate PR gate policy',
        'Resolve exact-head certification admission',
        'Report quick draft lane',
        'Node setup',
        'Run PR finalizer gate',
      ].map((name, i) => ({
        name,
        number: i + 1,
        status: 'completed',
        conclusion: i < 4 ? 'success' : 'skipped',
      }));
    const request = f.client.request;
    f.client.request = endpoint =>
      endpoint.endsWith('/actions/runs/200') ? structuredClone(deferred) : request(endpoint);
    const pages = f.client.pages;
    f.client.pages = async (endpoint, key) => {
      if (endpoint.endsWith('/actions/runs/200/attempts/1/jobs'))
        return { values: [structuredClone(job)], complete: true };
      const result = await pages(endpoint, key);
      if (key === 'workflow_runs') result.values.unshift(structuredClone(deferred));
      return result;
    };
    assert.equal(
      (await refreshOne(f.client, 17, f.evidence.workflow, { now: f.evidence.now, apply: true }))
        .status,
      'refresh-requested'
    );
    assert.equal(f.writes.length, 1);
    const before = f.client.request;
    let deferredReads = 0;
    f.client.request = endpoint => {
      if (endpoint.endsWith('/actions/runs/200') && ++deferredReads === 3)
        deferred.status = 'in_progress';
      return before(endpoint);
    };
    f.writes.length = 0;
    assert.equal(
      (
        await refreshOne(f.client, 17, f.evidence.workflow, {
          now: f.evidence.now,
          apply: true,
        })
      ).status,
      'selection-changed'
    );
    assert.deepEqual(f.writes, [], 'deferred attempts must be reread immediately before POST');
    f.client.request = before;
    deferred.status = 'completed';
    for (const mutate of [
      () => {
        deferred.status = 'in_progress';
      },
      () => {
        deferred.status = 'completed';
        job.run_attempt = 2;
      },
      () => {
        job.run_attempt = 1;
        job.name = 'unknown';
      },
    ]) {
      mutate();
      f.writes.length = 0;
      await refreshOne(f.client, 17, f.evidence.workflow, { now: f.evidence.now, apply: true });
      assert.deepEqual(f.writes, []);
    }
  });
}
