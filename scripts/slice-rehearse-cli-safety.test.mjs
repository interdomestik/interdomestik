import assert from 'node:assert/strict';
import { readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from './slice-rehearse-core.mjs';
import { collectRepositoryFacts, runSliceRehearsal } from './slice-rehearse.mjs';
import { github } from './lean-current-authority-git.mjs';
import * as remote from './lean-current-authority-git.mjs';

import { git, createRepository, manifest } from './slice-rehearse-cli-fixtures.mjs';

function rehearse(fixture, options) {
  return runSliceRehearsal({
    readProtectedMain: () => fixture.headSha,
    collectVerifiedEvidence: () => ({}),
    ...options,
  });
}

function capture(fixture, manifestPath, options = {}) {
  const output = [],
    errors = [];
  const code = rehearse(fixture, {
    argv: ['--manifest', manifestPath],
    cwd: fixture.repository,
    stdout: value => output.push(value),
    stderr: value => errors.push(value),
    ...options,
  });
  return { code, output, errors };
}

for (const fault of ['none', 'remote', 'local-during-remote']) {
  test(`rehearsal observes remote reads before evaluating: ${fault}`, t => {
    const f = createRepository(t),
      file = join(f.root, 'manifest.json');
    writeFileSync(file, canonicalJson(manifest(f.headSha)));
    let reads = 0,
      evaluated = 0;
    const result = capture(f, file, {
      readProtectedMain: repo => github('main', repo).sha,
      readGithub: () => {
        reads++;
        if (reads === 2 && fault === 'local-during-remote')
          writeFileSync(join(f.repository, 'declared.txt'), 'torn\n');
        return { sha: reads === 2 && fault === 'remote' ? f.baselineSha : f.headSha };
      },
      evaluate: () => {
        evaluated++;
        return { authorityStops: [] };
      },
    });
    assert.equal(result.code, fault === 'none' ? 0 : 1, result.errors.join(''));
    assert.equal(evaluated, fault === 'none' ? 1 : 0);
    assert.equal(result.output.length, fault === 'none' ? 1 : 0);
    assert.equal(reads, 2);
  });
}

test('fails closed for malformed input or missing baseline blob', t => {
  assert.match(
    readFileSync(new URL('./slice-rehearse.mjs', import.meta.url), 'utf8'),
    /allowedRoots: \[cwd, tmpdir\(\), '\/private\/tmp'\]/u
  );
  const fixture = createRepository(t);
  const malformedPath = join(fixture.root, 'malformed.json');
  writeFileSync(malformedPath, '{');
  const { code, output, errors } = capture(fixture, malformedPath);
  assert.equal(code, 1);
  assert.deepEqual(output, []);
  assert.match(errors.join(''), /manifest/i);

  const manifestPath = join(fixture.root, 'manifest.json');
  writeFileSync(manifestPath, canonicalJson(manifest(fixture.headSha)));
  const budgetPath = join(fixture.repository, 'scripts/repo-size-budget.json');
  const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
  budget.baseline.protectedMainSha = 'f'.repeat(40);
  writeFileSync(budgetPath, canonicalJson(budget));
  git(fixture.repository, ['add', 'scripts/repo-size-budget.json']);
  git(fixture.repository, ['commit', '-q', '-m', 'missing baseline fixture']);
  const missing = capture(fixture, manifestPath, {
    readProtectedMain: () => git(fixture.repository, ['rev-parse', 'HEAD']),
    evaluate: () => assert.fail('evaluator must not run without baseline budget evidence'),
  });
  assert.equal(missing.code, 1);
  assert.deepEqual(missing.output, []);
  assert.match(missing.errors.join(''), /baseline budget/i);
});

test('rejects symlink manifest and budget inputs', t => {
  const fixture = createRepository(t);
  const realManifest = join(fixture.root, 'manifest.json');
  const linkedManifest = join(fixture.root, 'manifest-link.json');
  writeFileSync(realManifest, canonicalJson(manifest(fixture.headSha)));
  symlinkSync(realManifest, linkedManifest);
  const linked = capture(fixture, linkedManifest);
  assert.equal(linked.code, 1);
  assert.deepEqual(linked.output, []);
  assert.match(linked.errors.join(''), /regular file|symlink/iu);

  const budgetPath = join(fixture.repository, 'scripts/repo-size-budget.json');
  const externalBudget = join(fixture.root, 'external-budget.json');
  writeFileSync(externalBudget, readFileSync(budgetPath));
  rmSync(budgetPath);
  symlinkSync(externalBudget, budgetPath);
  const budgetResult = capture(fixture, realManifest);
  assert.equal(budgetResult.code, 1);
  assert.deepEqual(budgetResult.output, []);
  assert.match(budgetResult.errors.join(''), /regular file|symlink/iu);
});

test('reports worktree budget drift', t => {
  const fixture = createRepository(t);
  const manifestPath = join(fixture.root, 'manifest.json');
  writeFileSync(manifestPath, canonicalJson(manifest(fixture.headSha)));
  const budgetPath = join(fixture.repository, 'scripts/repo-size-budget.json');
  const worktreeBudget = JSON.parse(readFileSync(budgetPath, 'utf8'));
  worktreeBudget.reserve.rationale = `${worktreeBudget.reserve.rationale} Candidate drift.`;
  writeFileSync(budgetPath, canonicalJson(worktreeBudget));
  const { code, output, errors } = capture(fixture, manifestPath);
  assert.equal(code, 2, errors.join(''));
  assert.deepEqual(errors, []);
  const report = JSON.parse(output.join(''));
  assert.ok(report.authorityStops.some(item => item.code === 'capacity:worktree-budget-drift'));
});

test('does not grant sensitive cleanup without independent operation facts', t => {
  const fixture = createRepository(t);
  const value = manifest(fixture.headSha);
  value.routineOperations = [
    {
      operation: 'task_owned_cleanup',
      target: {
        taskId: 'HARNESS-V2-CLI',
        artifactPaths: ['/private/tmp/harness-v2-cli'],
      },
      preconditions: { authorityInactive: true },
    },
  ];
  const manifestPath = join(fixture.root, 'manifest.json');
  writeFileSync(manifestPath, canonicalJson(value));
  const { code, output, errors } = capture(fixture, manifestPath);
  assert.equal(code, 2, errors.join(''));
  assert.deepEqual(errors, []);
  const report = JSON.parse(output.join(''));
  assert.equal(report.repository.operationFacts, null);
  assert.ok(
    report.authorityStops.some(
      item =>
        item.code === 'envelope:operation-precondition-unverified' &&
        item.operation === 'task_owned_cleanup' &&
        item.reason === 'authority-facts-unavailable'
    ),
    JSON.stringify(report.authorityStops)
  );
  assert.equal(report.operationalEnvelope, null);
});

for (const phase of ['anchor', 'facts', 'index', 'budget', 'operations', 'proof']) {
  test(`holds changed local observation after ${phase} before downstream collection`, t => {
    const fixture = createRepository(t);
    const manifestPath = join(fixture.root, 'manifest.json');
    writeFileSync(manifestPath, canonicalJson(manifest(fixture.headSha)));
    const calls = [];
    const errors = [];
    const mutate = () => {
      if (phase === 'anchor') git(fixture.repository, ['checkout', '-q', '-b', 'torn-anchor']);
      else if (phase === 'index')
        git(fixture.repository, ['update-index', '--chmod=+x', 'declared.txt']);
      else if (phase === 'budget')
        writeFileSync(join(fixture.repository, 'scripts/repo-size-budget.json'), '{}\n');
      else writeFileSync(join(fixture.repository, 'declared.txt'), 'next\n');
    };
    const code = rehearse(fixture, {
      argv: ['--manifest', manifestPath],
      cwd: fixture.repository,
      stdout: () => calls.push('stdout'),
      stderr: value => errors.push(value),
      collectFacts: options => {
        const facts = collectRepositoryFacts(options);
        if (!['operations', 'proof'].includes(phase)) mutate();
        return facts;
      },
      collectOperations: () => {
        calls.push('operations');
        if (phase === 'operations') mutate();
        return null;
      },
      collectVerifiedEvidence: () => {
        calls.push('proof');
        mutate();
        return {};
      },
      evaluate: () => {
        calls.push('evaluate');
        return { authorityStops: [] };
      },
    });
    assert.equal(code, 1);
    assert.match(errors.join(''), /local.*(?:anchor|observation).*changed/iu);
    assert.deepEqual(
      calls,
      phase === 'operations' ? ['operations'] : phase === 'proof' ? ['operations', 'proof'] : []
    );
    if (phase !== 'anchor')
      assert.equal(git(fixture.repository, ['rev-parse', 'HEAD']), fixture.headSha);
  });
}

const headSha = 'a'.repeat(40);
const treeSha = 'b'.repeat(40);

test('remote observation deduplicates reads, isolates consumers and ignores JSON key order', () => {
  let calls = 0;
  const result = remote.withRemoteReadConsistency(
    '/repo',
    () => {
      remote.github('pull', '/repo').head.sha = 'consumer mutation';
      assert.equal(remote.github('pull', '/repo').head.sha, headSha);
      return 'observed';
    },
    () =>
      ++calls === 1
        ? { head: { sha: headSha }, state: 'open' }
        : { state: 'open', head: { sha: headSha } }
  );
  assert.equal(result, 'observed');
  assert.equal(calls, 2);
});

for (const fault of [
  'changed',
  'unavailable',
  'verification-unavailable',
  'malformed',
  'null',
  'scalar',
  'cross-repo',
  'count',
  'bytes',
  'total',
  'async',
]) {
  test(`remote observation fails closed: ${fault}`, () => {
    let calls = 0;
    assert.throws(
      () =>
        remote.withRemoteReadConsistency(
          '/repo',
          () => {
            try {
              for (let n = 0; n < (fault === 'count' ? 129 : fault === 'total' ? 5 : 1); n++)
                remote.github(`pull/${n}`, fault === 'cross-repo' ? '/foreign' : '/repo');
            } catch {
              /* A collector may withhold evidence, but cannot repair the observation. */
            }
            return fault === 'async' ? Promise.resolve() : {};
          },
          () => {
            calls++;
            if (fault === 'unavailable' || (fault === 'verification-unavailable' && calls > 1))
              throw new Error('provider unavailable');
            if (fault === 'malformed') return { missing: undefined };
            if (fault === 'null') return null;
            if (fault === 'scalar') return 'not a fact resource';
            if (fault === 'bytes') return { payload: 'x'.repeat(4 * 1024 * 1024) };
            if (fault === 'total') return { payload: 'x'.repeat(3500 * 1024) };
            return { head: calls > 1 && fault === 'changed' ? treeSha : headSha };
          }
        ),
      /remote observation/u
    );
  });
}
