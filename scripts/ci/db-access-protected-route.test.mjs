import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { writeFixture } from './db-access-guard-test-utils.mjs';
import {
  audit,
  step,
  ambient,
  tmp,
  git,
  commit,
  legacyFiles,
  legacyOrigin,
  legacyCommand,
  checkout,
  route,
  sentinelModule,
} from './db-access-protected-test-utils.mjs';

test('route is unconditional, precedes candidate setup/install, and takes identity only from event expressions', () => {
  const index = audit.steps.indexOf(step);
  assert.ok(index > 0 && step.if === undefined);
  const firstCandidate = audit.steps.findIndex(
    item =>
      item !== step && (item.uses === './.github/actions/setup' || /\bpnpm\b/u.test(item.run ?? ''))
  );
  assert.ok(index < firstCandidate);
  assert.deepEqual(
    { ...step.env },
    {
      EVENT_NAME: '${{ github.event_name }}',
      EVENT_SHA: '${{ github.sha }}',
      CANDIDATE_SHA: audit.steps.find(item => item.uses?.startsWith('actions/checkout@')).with.ref,
      EVENT_REF: '${{ github.ref }}',
      PUSH_AFTER: '${{ github.event.after }}',
      PR_BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      PR_BASE_REF: '${{ github.event.pull_request.base.ref }}',
      DEFAULT_BRANCH: '${{ github.event.repository.default_branch }}',
      TS_EXPECTED_VERSION: '5.9.3',
      DATABASE_URL: '',
      BETTER_AUTH_SECRET: '',
      TURBO_TOKEN: '',
      TURBO_TEAM: '',
      TURBO_REMOTE_CACHE_SIGNATURE_KEY: '',
    }
  );
  assert.ok(!step.run.includes('${{'));
});

test('first adoption: protected legacy guard passes a clean candidate from outside the workspace and writes nothing into it', () => {
  const { origin } = legacyOrigin();
  const { ws } = checkout(origin);
  const result = route(ws);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.status, 'pass');
  assert.ok(result.report.scannedCount > 0);
  assert.equal(git(ws, 'status', '--porcelain', '--ignored'), '');
});

test('no-arg malicious entrypoint, fake package script and candidate guard modules are never executed', () => {
  const { origin } = legacyOrigin();
  const sentinel = path.join(tmp('sentinel'), 'loaded');
  const { ws } = checkout(origin, root => {
    writeFixture(root, 'package.json', JSON.stringify({ scripts: { 'check:db-access': 'true' } }));
    writeFixture(root, 'scripts/check-db-access-guard.mjs', sentinelModule(sentinel));
    for (const file of legacyFiles.filter(file => file.startsWith('scripts/ci/')))
      writeFixture(root, file, sentinelModule(sentinel));
    writeFixture(root, 'apps/web/src/new.ts', ambient);
  });
  // Precondition: the candidate's own entrypoint really "passes" with no args.
  assert.equal(
    spawnSync(process.execPath, ['scripts/check-db-access-guard.mjs'], { cwd: ws }).status,
    0
  );
  fs.rmSync(sentinel, { force: true });
  const result = route(ws);
  assert.equal(result.status, 1);
  assert.ok(result.report.failingNewEntries.some(entry => entry.file === 'apps/web/src/new.ts'));
  assert.equal(fs.existsSync(sentinel), false);
});

test('candidate-washed baseline is ignored; protected baseline is immutable', () => {
  const { origin } = legacyOrigin();
  const { ws } = checkout(origin, root => {
    writeFixture(root, 'apps/web/src/new.ts', ambient);
    const wash = legacyCommand(root, ['--write-baseline']);
    assert.equal(wash.status, 0);
  });
  assert.equal(legacyCommand(ws).status, 0);
  const result = route(ws);
  assert.equal(result.status, 1);
  assert.ok(result.report.failingNewEntries.some(entry => entry.file === 'apps/web/src/new.ts'));
});

test('strict event identity; selector-like environment is ignored', () => {
  const { origin } = legacyOrigin();
  const { ws, head } = checkout(origin, root => writeFixture(root, 'apps/web/src/new.ts', ambient));
  for (const event of [
    { PR_BASE_SHA: 'HEAD' },
    { PR_BASE_SHA: head.slice(0, 12) },
    { PR_BASE_SHA: head.toUpperCase() },
    { PR_BASE_SHA: '' },
    { EVENT_NAME: 'workflow_dispatch' },
    { EVENT_SHA: '' },
    { CANDIDATE_SHA: '' },
    { CANDIDATE_SHA: '1'.repeat(40) },
    { DEFAULT_BRANCH: 'candidate' },
    { EVENT_NAME: 'push', EVENT_REF: 'refs/heads/main', PUSH_AFTER: '0'.repeat(40) },
    { EVENT_NAME: 'push', EVENT_REF: 'refs/heads/candidate', PUSH_AFTER: head, EVENT_SHA: head },
  ]) {
    const result = route(ws, event);
    assert.equal(result.status, 1, JSON.stringify(event));
    assert.match(result.stderr, /incomplete/u);
  }
  const result = route(
    ws,
    {},
    { PROTECTED_SHA: head, DB_ACCESS_GUARD_TRUST_ROOT: head, TENANT_GUARD_BASE: head }
  );
  assert.equal(result.status, 1);
  assert.ok(result.report.failingNewEntries.some(entry => entry.file === 'apps/web/src/new.ts'));
});

test('push uses the exact event commit and rejects commits outside the default branch', () => {
  const { origin, base } = legacyOrigin();
  const { ws, head } = checkout(origin);
  const push = {
    EVENT_NAME: 'push',
    EVENT_REF: 'refs/heads/main',
    PR_BASE_SHA: '',
    PR_BASE_REF: '',
  };
  git(ws, 'checkout', '-q', base);
  assert.equal(
    route(ws, { ...push, EVENT_SHA: base, PUSH_AFTER: base, CANDIDATE_SHA: base }).status,
    0
  );
  git(ws, 'update-ref', 'refs/remotes/origin/feature', head);
  const off = route(ws, { ...push, EVENT_SHA: head, PUSH_AFTER: head });
  assert.equal(off.status, 1);
  assert.match(off.stderr, /not on main/u);
});

test('missing objects, shallow history and missing protected refs fail closed', () => {
  const { origin } = legacyOrigin();
  const { ws } = checkout(origin);
  assert.match(route(ws, { PR_BASE_SHA: '1'.repeat(40) }).stderr, /missing anchor object/u);
  const shallow = checkout(origin, () => {}, { depth: 1 });
  assert.match(route(shallow.ws).stderr, /full local repository|shallow/u);
  const base = git(ws, 'rev-parse', 'origin/main');
  git(ws, 'update-ref', '-d', 'refs/remotes/origin/main');
  assert.match(route(ws, { PR_BASE_SHA: base }).stderr, /default ref missing/u);
});

test('stacked PR authority is the default-branch merge-base, never the unprotected base branch', () => {
  const { origin } = legacyOrigin();
  git(origin, 'checkout', '-q', '-b', 'feature');
  writeFixture(origin, 'scripts/check-db-access-guard.mjs', 'process.exit(0);\n');
  const feature = commit(origin, 'unprotected weakening');
  git(origin, 'checkout', '-q', 'main');
  const { ws } = checkout(origin, root => writeFixture(root, 'apps/web/src/new.ts', ambient));
  assert.equal(route(ws, { PR_BASE_SHA: feature, PR_BASE_REF: 'feature' }).status, 1);
  assert.match(
    route(ws, { PR_BASE_SHA: feature, PR_BASE_REF: 'main' }).stderr,
    /base sha not on main/u
  );
});

test('protected closure must be complete and self-contained; candidate files never satisfy it', () => {
  for (const [edit, reason] of [
    [
      root =>
        fs.appendFileSync(
          path.join(root, 'scripts/check-db-access-guard.mjs'),
          "\nimport './ci/missing.mjs';\n"
        ),
      /closure missing/u,
    ],
    [
      root =>
        fs.appendFileSync(
          path.join(root, 'scripts/check-db-access-guard.mjs'),
          "\nimport pad from 'left-pad';\n"
        ),
      /unsupported specifier left-pad/u,
    ],
    [
      root =>
        fs.appendFileSync(
          path.join(root, 'scripts/check-db-access-guard.mjs'),
          "\nawait import('./ci/x.mjs');\n"
        ),
      /dynamic loading/u,
    ],
    [
      root => {
        fs.rmSync(path.join(root, 'scripts/ci/db-access-constants.mjs'));
        fs.symlinkSync('/etc/hosts', path.join(root, 'scripts/ci/db-access-constants.mjs'));
      },
      /non-regular/u,
    ],
  ]) {
    const { origin } = legacyOrigin(edit);
    const { ws } = checkout(origin, root => {
      writeFixture(root, 'scripts/ci/missing.mjs', 'export {};');
      writeFixture(root, 'node_modules/left-pad/index.js', 'module.exports = x => x;');
    });
    const result = route(ws);
    assert.equal(result.status, 1);
    assert.match(result.stderr, reason);
  }
});
