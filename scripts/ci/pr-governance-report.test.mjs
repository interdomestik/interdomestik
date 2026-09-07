import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { GitHubCliClient, githubCliResponse } from './pr-delivery-cli.mjs';
import { collectGovernanceReport, governanceReport } from './pr-governance-report-lib.mjs';
import { B, H, T, contract, check, snapshot } from './pr-delivery-fixtures.mjs';

function reportSnapshot() {
  const value = snapshot();
  value.checks.push(check('delivery-gate', 15368));
  return value;
}

function reportClient(checks, drift = false) {
  let pullReads = 0;
  const raw = checks.map((item, index) => ({
    id: index + 1000,
    name: item.context,
    app: { id: item.appId },
    head_sha: item.headSha,
    status: item.status,
    conclusion: item.conclusion,
    details_url: `https://github.com/interdomestik/interdomestik/actions/runs/${item.runId}/job/${index + 1000}`,
  }));
  return new GitHubCliClient(contract.repository, (args, input) => {
    assert.deepEqual(args.slice(0, 3), ['api', '--hostname', 'github.com']);
    assert.equal(args.includes('Authorization'), false);
    const url = new URL(args[10], 'https://api.github.com/');
    const pathname = url.pathname;
    let payload;
    if (pathname.endsWith('/pulls/1693')) {
      pullReads += 1;
      payload = {
        number: 1693,
        state: 'open',
        base: { sha: B },
        head: { sha: drift && pullReads === 3 ? '9'.repeat(40) : H },
        merge_commit_sha: T,
      };
    } else if (pathname.endsWith('/files')) {
      payload = [{ filename: 'apps/web/src/example.ts' }];
    } else if (pathname.includes('/git/commits/')) {
      const sha = pathname.split('/').at(-1);
      const commit = snapshot().commits[sha];
      payload = {
        tree: { sha: commit.tree },
        parents: commit.parents.map(parent => ({ sha: parent })),
      };
    } else if (pathname.endsWith('/check-runs')) {
      payload = { check_runs: raw };
    } else if (pathname.includes('/actions/jobs/')) {
      const item = checks[Number(pathname.split('/').at(-1)) - 1000];
      payload = { run_id: item.runId, run_attempt: item.runAttempt };
    } else if (pathname === '/graphql') {
      assert.equal(args[5], 'POST');
      assert.equal(typeof JSON.parse(input).query, 'string');
      payload = {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } },
            },
          },
        },
      };
    } else if (/\/(reviews|comments|annotations)$/u.test(pathname)) {
      payload = [];
    } else {
      throw new Error('Unimplemented fixture endpoint: ' + pathname);
    }
    return 'HTTP/2.0 200 OK\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify(payload);
  });
}

for (const [older, newer, pass] of [
  ['failure', 'success', true],
  ['success', 'failure', false],
]) {
  test(`report collection selects newer ${newer} over older ${older}`, async () => {
    const value = reportSnapshot();
    const old = value.checks.find(item => item.context === 'e2e');
    Object.assign(old, { conclusion: older, runId: 1 });
    value.checks.push({ ...old, conclusion: newer, runId: 2 });
    const report = await collectGovernanceReport(reportClient(value.checks), contract, 1693);
    assert.equal(report.failures.length === 0, pass);
    assert.match(
      report.rows.get('e2e'),
      pass ? /completed\/success/u : /FAIL: e2e conclusion failure/u
    );
  });
}

test('report collection refuses PR head drift during its reads', async () => {
  const report = await collectGovernanceReport(
    reportClient(reportSnapshot().checks, true),
    contract,
    1693
  );
  assert.match(report.failures.join('\n'), /pull request identity changed/u);
});

for (const [label, change, pattern] of [
  [
    'later failed attempt',
    value =>
      value.checks.push({
        ...value.checks[0],
        runAttempt: 2,
        conclusion: 'failure',
      }),
    /conclusion failure/u,
  ],
  [
    'duplicate current attempt',
    value => value.checks.push({ ...value.checks[0] }),
    /duplicate current check/u,
  ],
  ['missing required check', value => value.checks.shift(), /missing check/u],
  [
    'wrong app',
    value => {
      value.checks[0].appId = 99;
    },
    /wrong-app check/u,
  ],
  [
    'stale head',
    value => {
      value.checks[0].headSha = B;
    },
    /stale-head check/u,
  ],
  [
    'pending check',
    value => {
      value.checks[0].status = 'in_progress';
    },
    /pending check/u,
  ],
  [
    'incomplete check pagination',
    value => {
      value.feedback.pagination.checks = false;
    },
    /pagination incomplete/u,
  ],
  [
    'incomplete annotations',
    value => {
      value.feedback.pagination.annotations = false;
    },
    /pagination incomplete/u,
  ],
  [
    'actionable annotation',
    value => {
      value.checks[0].annotations = [{ level: 'failure', message: 'issue' }];
    },
    /actionable annotation/u,
  ],
  [
    'failed delivery context',
    value => {
      value.checks.at(-1).conclusion = 'failure';
    },
    /delivery-gate conclusion failure/u,
  ],
]) {
  test('report refuses ' + label, () => {
    const value = reportSnapshot();
    change(value);
    assert.match(governanceReport(contract, value).failures.join('\n'), pattern);
  });
}

test('CLI transport preserves Link pagination even when a page is short', async () => {
  const observed = [];
  const client = new GitHubCliClient(contract.repository, args => {
    const page = new URL(args[10], 'https://api.github.com').searchParams.get('page');
    observed.push(page);
    const header = page === '1' ? 'Link: <https://api.github.com/next>; rel="next"\r\n' : '';
    return `HTTP/2.0 200 OK\r\n${header}\r\n[${page}]`;
  });
  assert.deepEqual(await client.pages('repos/interdomestik/interdomestik/pulls/1693/reviews'), {
    values: [1, 2],
    complete: true,
  });
  assert.deepEqual(observed, ['1', '2']);
});

test('CLI transport retains API failures and endpoint boundaries', async () => {
  const client = new GitHubCliClient(
    contract.repository,
    () => 'HTTP/2.0 403 Forbidden\r\nContent-Type: application/json\r\n\r\n{}'
  );
  await assert.rejects(
    client.request('repos/interdomestik/interdomestik/pulls/1693'),
    /returned 403/u
  );
  assert.throws(() => githubCliResponse('https://example.com/x'), /trusted boundary/u);
  assert.throws(
    () =>
      githubCliResponse('repos/interdomestik/interdomestik/pulls/1693', {
        method: 'DELETE',
      }),
    /Unsupported CLI API method/u
  );
  assert.throws(
    () => githubCliResponse('repos/interdomestik/interdomestik/pulls/1693', {}, () => '{}'),
    /headers missing/u
  );
});

test('report exports remain synchronously loadable by the Harness', () => {
  const entry = fileURLToPath(new URL('../github-pr-governance-report.mjs', import.meta.url));
  assert.equal(
    execFileSync(process.execPath, ['-e', `require(${JSON.stringify(entry)})`], {
      encoding: 'utf8',
      timeout: 10_000,
    }),
    ''
  );
});
