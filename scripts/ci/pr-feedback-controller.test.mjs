import assert from 'node:assert/strict';
import test from 'node:test';
import * as controller from './pr-feedback-controller.mjs';
import { refreshOne, validateControllerEnvironment } from './pr-feedback-controller.mjs';
import {
  controllerFixture as fixture,
  repository,
  base,
  head,
} from './pr-feedback-refresh-fixtures.mjs';

test('ambiguous dispatch failure is not retried by the authoritative workflow controller', async () => {
  const f = fixture();
  const request = f.client.request;
  f.client.request = endpoint =>
    endpoint.includes('/actions/workflows/pr-')
      ? structuredClone(f.evidence.workflow)
      : request(endpoint);
  const graphql = f.client.graphql;
  f.client.graphql = (query, variables) =>
    query.includes('pullRequests(')
      ? {
          repository: {
            pullRequests: { nodes: [{ number: 17 }], pageInfo: { hasNextPage: false } },
          },
        }
      : graphql(query, variables);
  f.client.response = async endpoint => {
    f.writes.push(endpoint);
    // The server may have accepted the POST: the next independent inspection must see this.
    f.evidence.run.status = 'in_progress';
    throw new Error('transport interrupted');
  };
  const reports = [];
  const result = await controller.refreshRepository(f.client, {
    now: f.evidence.now,
    apply: true,
    report: item => reports.push(item),
  });
  assert.equal(result.failed, 1);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(
    reports.map(item => item.status),
    ['refresh-failed']
  );
});

test('controller dry-run is read only; apply revalidates before its single exact rerun', async () => {
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

for (const lane of ['delivery', 'raw-delivery']) {
  test(`a proven deferred ${lane} label run cannot hide the latest real gate`, async () => {
    const f = fixture();
    const deferred = {
      ...f.evidence.run,
      id: 200,
      conclusion: 'skipped',
      display_title: f.evidence.run.display_title.replace(':opened:', ':labeled:'),
    };
    const job = {
      id: 201,
      run_id: 200,
      run_attempt: 1,
      status: 'completed',
      conclusion: deferred.conclusion,
      name: 'delivery-gate-deferred',
      steps: [],
    };
    if (lane === 'raw-delivery')
      job.name =
        "github.event.pull_request.base.ref == 'main' && github.event.pull_request.state == 'open' && !github.event.pull_request.draft && (github.event.action != 'labeled' || github.event.label.name == 'full-gate') && 'delivery-gate' || 'delivery-gate-deferred'";
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
    const singleRequest = f.client.request;
    const singlePages = f.client.pages;
    for (const count of [19, 20]) {
      const deferredRuns = Array.from({ length: count }, (_, i) => ({ ...deferred, id: 200 + i }));
      f.client.request = endpoint => {
        const match = deferredRuns.find(run => endpoint.endsWith(`/actions/runs/${run.id}`));
        return match ? structuredClone(match) : singleRequest(endpoint);
      };
      f.client.pages = async (endpoint, key) => {
        if (key === 'workflow_runs')
          return { values: [...deferredRuns, f.evidence.run], complete: true };
        const match = deferredRuns.find(run =>
          endpoint.endsWith(`/actions/runs/${run.id}/attempts/1/jobs`)
        );
        if (match)
          return { values: [{ ...job, id: match.id + 1000, run_id: match.id }], complete: true };
        return singlePages(endpoint, key);
      };
      f.writes.length = 0;
      const refresh = refreshOne(f.client, 17, f.evidence.workflow, {
        now: f.evidence.now,
        apply: true,
      });
      if (count === 19) assert.equal((await refresh).status, 'refresh-requested');
      else {
        await assert.rejects(refresh, /run selection incomplete/u);
        assert.deepEqual(f.writes, []);
      }
    }
    f.client.request = singleRequest;
    f.client.pages = singlePages;
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
