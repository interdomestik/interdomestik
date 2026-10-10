import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SOURCE_COMMIT, SOURCE_TREE, showAt, tmp } from './db-access-required-git.mjs';
import { nodeEnv } from './db-access-required-fixtures.mjs';
import {
  CHECKOUT,
  embedded,
  guardStep,
  job,
  localScript,
  workflow,
  workflowText,
} from './db-access-required-workflow.mjs';

test('required workflow: default pull_request activities only, one unconditional read-only job', () => {
  assert.deepEqual(Object.keys(workflow).sort(), ['jobs', 'name', 'on', 'permissions']);
  assert.deepEqual(workflow.on, { pull_request: null });
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), ['tenant-guard']);
  assert.deepEqual(Object.keys(job).sort(), ['name', 'runs-on', 'steps', 'timeout-minutes']);
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  for (const forbidden of [
    /\bsecrets\b/u,
    /\bvars\./u,
    /\bmerge_group\b/u,
    /pull_request_target/u,
    /workflow_run/u,
    /workflow_dispatch/u,
    /issue_comment/u,
    /\bconcurrency\b/u,
    /cancel-in-progress/u,
    /^\s*-?\s*if:/mu,
    /continue-on-error/u,
    /\bneeds\b/u,
    /uses:\s*\.\//u,
    /\.github\//u,
    /\b(?:pnpm|npx)(?=[\s;&|])/u,
    /actions\/(?:setup-node|cache|upload-artifact)/u,
    /head_ref|head\.ref/u,
    /od17/iu,
    /\bgeneration\b|\blegacy\b|tree\.has\(|db-access-evaluator/u,
  ])
    assert.doesNotMatch(workflowText, forbidden);
});

test('checkout is the pinned official action on the event merge ref, full history, no credentials', () => {
  assert.equal(job.steps.length, 2);
  const [checkout, guard] = job.steps;
  assert.deepEqual(checkout, {
    uses: CHECKOUT,
    with: { 'fetch-depth': 0, 'persist-credentials': false },
  });
  assert.equal(guard, guardStep);
  assert.deepEqual(Object.keys(guard).sort(), ['env', 'id', 'name', 'run', 'shell']);
  assert.equal(guard.shell, 'bash');
});

test('identity is bound only to GitHub event expressions; no expression interpolation or extra inputs', () => {
  assert.deepEqual(guardStep.env, {
    EVENT_NAME: '${{ github.event_name }}',
    EVENT_REPO: '${{ github.repository }}',
    EVENT_REF: '${{ github.ref }}',
    EVENT_SHA: '${{ github.sha }}',
    PR_NUMBER: '${{ github.event.pull_request.number }}',
    PR_BASE_REPO: '${{ github.event.pull_request.base.repo.full_name }}',
    PR_BASE_REF: '${{ github.event.pull_request.base.ref }}',
    PR_BASE_SHA: '${{ github.event.pull_request.base.sha }}',
    PR_HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    DEFAULT_BRANCH: '${{ github.event.repository.default_branch }}',
    TS_EXPECTED_VERSION: '5.9.3',
  });
  assert.ok(!guardStep.run.includes('${{'));
  assert.match(guardStep.run, /^expected_repo='interdomestik\/interdomestik'$/mu);
  assert.match(guardStep.run, /^expected_branch='main'$/mu);
  const used = new Set([...guardStep.run.matchAll(/\$\{?([A-Z][A-Z0-9_]*)/gu)].map(m => m[1]));
  const allowed = new Set([
    ...Object.keys(guardStep.env),
    'GITHUB_WORKSPACE',
    'RUNNER_TEMP',
    'GITHUB_ACTIONS',
    'DB_GUARD_FIXTURE_TYPESCRIPT_TGZ',
  ]);
  assert.deepEqual(
    [...used].filter(name => !allowed.has(name)),
    []
  );
});

test('executable source is one immutable approved commit/tree; the event base is never read as code', () => {
  const run = guardStep.run;
  assert.equal(run.match(/^source_(?:commit|tree)=/gmu)?.length, 2);
  assert.match(run, new RegExp(`^source_commit='${SOURCE_COMMIT}'$`, 'mu'));
  assert.match(run, new RegExp(`^source_tree='${SOURCE_TREE}'$`, 'mu'));
  assert.ok(
    run.includes(
      '"$work/bootstrap.mjs" "$work" "$source_commit" "$source_tree" "$TS_EXPECTED_VERSION"'
    )
  );
  assert.ok(run.includes('entry="$work/protected/scripts/check-db-access-guard.mjs"'));
  assert.deepEqual(run.match(/cat-file blob "[^"]*"/gu), [
    'cat-file blob "$source_commit:scripts/ci/db-access-baseline.json"',
  ]);
  assert.doesNotMatch(
    run,
    /cat-file[^\n]*PR_BASE_SHA|bootstrap\.mjs[^\n]*PR_BASE_SHA|protected="\$PR_BASE_SHA"/u
  );
  assert.equal((run.match(/\bfetch\b -q/gu) ?? []).length, 1);
  assert.ok(run.includes('fetch -q --no-tags --no-write-fetch-head "file://$ws/.git"'));
});

test('Linux production text is executed verbatim locally; no harness translation exists', () => {
  assert.equal(localScript, guardStep.run);
  assert.ok(guardStep.run.includes('HOME="$work/home" /usr/bin/timeout --signal=TERM'));
  assert.ok(
    guardStep.run.includes(
      "run('/usr/bin/tar', ['-xzf', tgz, '-C', stage, '--no-same-owner', '--no-same-permissions']);"
    )
  );
  assert.ok(guardStep.run.includes('/usr/bin/git)'));
  assert.ok(
    guardStep.run.includes(
      'node_=(env -i PATH=/usr/bin:/bin HOME="$work/home" LC_ALL=C TZ=UTC CI=true "$node_bin" --no-addons)'
    )
  );
});

test('embedded lock parser is linear and rejects missing/ambiguous blocks in the approved lock', () => {
  const parse = new Function(
    'blob',
    'tsVersion',
    'fail',
    `${embedded('const uniqueBlock = ', 'const tgz = ')}; return { version, pinned };`
  );
  const lock = showAt(SOURCE_COMMIT, 'pnpm-lock.yaml').toString('utf8');
  const check = text =>
    parse(
      () => Buffer.from(text),
      '5.9.3',
      reason => {
        throw new Error(reason);
      }
    );
  const parsed = check(lock);
  assert.equal(parsed.version, '5.9.3');
  assert.equal(parsed.pinned.length, 1);
  for (const text of [
    lock.replace('importers:', 'not-importers:'),
    lock.replace('  .:', '  missing-root:'),
    lock.replace('      typescript:', '      absent-typescript:'),
    lock.replace(
      '      typescript:',
      '      typescript:\n        specifier: ^5.9.3\n        version: 5.9.3\n      typescript:'
    ),
    lock.replace('packages:', 'packages:\n  typescript@5.9.3:\n    resolution: {}'),
    lock.replace('  typescript@5.9.3:', '  missing-typescript:'),
    lock.replace(parsed.pinned[0][1], ''),
    lock
      .replace(parsed.pinned[0][1], '')
      .replace('  typescript@5.9.3:\n', '  typescript@5.9.3:\n' + '    malformed\n'.repeat(100000)),
  ])
    assert.throws(() => check(text), /protected lock/u);
});

test('embedded report contract: missing, blank, malformed, empty-scan or incomplete reports fail closed', () => {
  const script = embedded("-e '", '\' "$report"').slice(4);
  const dir = tmp('report');
  const baseline = path.join(dir, 'baseline.json');
  fs.writeFileSync(baseline, JSON.stringify({ entries: [1, 2] }));
  const malformedBaseline = path.join(dir, 'malformed-baseline.json');
  fs.writeFileSync(malformedBaseline, JSON.stringify({ entries: {} }));
  let index = 0;
  const summarize = (content, base = baseline) => {
    const file = path.join(dir, `report-${index++}.json`);
    if (content !== undefined) fs.writeFileSync(file, content);
    return spawnSync(process.execPath, ['-e', script, file, base], {
      env: nodeEnv,
      encoding: 'utf8',
    });
  };
  const valid = { status: 'pass', scannedCount: 3, newCount: 1, failingNewEntries: [] };
  const pass = JSON.stringify(valid);
  for (const content of [
    undefined,
    '',
    '{',
    'null',
    '{}',
    JSON.stringify({ ...valid, scannedCount: 0 }),
    JSON.stringify({ ...valid, scannedCount: 1.5 }),
    JSON.stringify({ ...valid, failingNewEntries: undefined }),
    JSON.stringify({ ...valid, failingNewEntries: [{ file: 'x' }] }),
    JSON.stringify({ ...valid, status: 'fail' }),
  ])
    assert.notEqual(summarize(content).status, 0, String(content));
  for (const newCount of [undefined, null, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])
    assert.notEqual(summarize(JSON.stringify({ ...valid, newCount })).status, 0, String(newCount));
  assert.notEqual(summarize(pass, malformedBaseline).status, 0);
  const ok = summarize(pass);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, 'scanned=3 new=1 failing_new=0 source_baseline_entries=2');
  const zero = summarize(JSON.stringify({ ...valid, newCount: 0 }));
  assert.equal(zero.status, 0, zero.stderr);
  assert.equal(zero.stdout, 'scanned=3 new=0 failing_new=0 source_baseline_entries=2');
});
