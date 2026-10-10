import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { rootDir, writeFixture } from './db-access-guard-test-utils.mjs';
import { runGit } from './db-access-git.mjs';
import {
  LEGACY_BASE,
  TS,
  audit,
  step,
  ambient,
  tmp,
  git,
  commit,
  fixtureLock,
  legacyFiles,
  legacyOrigin,
  legacyCommand,
  epochOrigin,
  checkout,
  route,
  sentinelModule,
  tsTarball,
} from './db-access-protected-test-utils.mjs';

test('post-merge epoch: TypeScript comes only from the protected-lock-verified tarball (compiler substitution)', () => {
  const { origin } = epochOrigin();
  assert.equal(route(checkout(origin).ws).status, 0);
  const sentinel = path.join(tmp('sentinel'), 'loaded');
  const { ws } = checkout(origin, root => {
    writeFixture(
      root,
      'node_modules/typescript/package.json',
      JSON.stringify({ name: 'typescript', version: TS, main: 'index.js' })
    );
    writeFixture(
      root,
      'node_modules/typescript/index.js',
      `require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'x'); process.exit(0);`
    );
    writeFixture(root, 'pnpm-lock.yaml', 'candidate lock cannot select compiler');
    writeFixture(root, 'apps/web/src/new.ts', ambient);
  });
  const result = route(ws);
  assert.equal(result.status, 1);
  assert.ok(result.report.failingNewEntries.some(entry => entry.file === 'apps/web/src/new.ts'));
  assert.equal(fs.existsSync(sentinel), false);
  // Substituted tarball: still checked against the *protected* lock.
  const evil = path.join(tmp('evil'), 'typescript.tgz');
  fs.writeFileSync(evil, Buffer.concat([fs.readFileSync(tsTarball), Buffer.from([0])]));
  assert.match(
    route(checkout(origin).ws, {}, { DB_GUARD_FIXTURE_TYPESCRIPT_TGZ: evil }).stderr,
    /does not match protected lock integrity/u
  );
  assert.match(
    route(checkout(origin).ws, { TS_EXPECTED_VERSION: '5.9.2' }).stderr,
    /is not 5\.9\.2/u
  );
  assert.match(route(checkout(origin).ws, {}, { GITHUB_ACTIONS: 'true' }).stderr, /fixture seam/u);
});

test('real protected lock accepts the official registry bytes and rejects a corrupted archive', () => {
  const realLock = runGit(['-C', rootDir, 'show', `${LEGACY_BASE}:pnpm-lock.yaml`]);
  const { origin } = legacyOrigin(root => writeFixture(root, 'pnpm-lock.yaml', realLock));
  const { ws } = checkout(origin);
  assert.equal(route(ws).status, 0);
  const evil = path.join(tmp('corrupt'), 'typescript.tgz');
  fs.writeFileSync(evil, Buffer.concat([fs.readFileSync(tsTarball), Buffer.from([0])]));
  assert.match(
    route(ws, {}, { DB_GUARD_FIXTURE_TYPESCRIPT_TGZ: evil }).stderr,
    /does not match protected lock integrity/u
  );
});

test('post-merge epoch: protected ADOPTION and baseline are immutable; changed resolver config fails closed', () => {
  const { origin, base } = epochOrigin();
  const cases = [
    [
      root =>
        writeFixture(root, 'scripts/ci/db-access-baseline.json', '{"entries":[{"all":true}]}'),
      /baseline modified/u,
    ],
    [
      root =>
        writeFixture(
          root,
          'apps/web/tsconfig.json',
          JSON.stringify({
            compilerOptions: { paths: { '@interdomestik/database': ['./src/fake.ts'] } },
          })
        ),
      /resolver boundary/u,
    ],
    [
      root => {
        writeFixture(
          root,
          'scripts/ci/db-access-adoption.mjs',
          `export const ADOPTION = Object.freeze({ commit: '${base}', tree: '${git(origin, 'rev-parse', `${base}^{tree}`)}', files: {}, critical: [] });\n`
        );
        writeFixture(root, 'apps/web/src/new.ts', ambient);
      },
      /./u,
    ],
  ];
  for (const [mutate, reason] of cases) {
    const result = route(checkout(origin, mutate).ws);
    assert.equal(result.status, 1);
    assert.match(JSON.stringify(result.report), reason);
  }
});

test('guard process sees no secrets, Node/npm/Git overrides or candidate preload', () => {
  const sentinel = path.join(tmp('sentinel'), 'preload');
  const preload = path.join(tmp('preload'), 'evil.cjs');
  fs.writeFileSync(preload, `require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'x');`);
  const { origin } = legacyOrigin(root =>
    writeFixture(root, 'scripts/check-db-access-guard.mjs', [
      "import fs from 'node:fs';",
      "const report = process.argv.find(arg => arg.startsWith('--report=')).slice(9);",
      'fs.writeFileSync(report, JSON.stringify({ status: "pass", scannedCount: 1, env: process.env, cwd: process.cwd(), execArgv: process.execArgv }));',
    ])
  );
  const { ws } = checkout(origin);
  const result = route(
    ws,
    {},
    {
      DATABASE_URL: 'postgres://secret',
      BETTER_AUTH_SECRET: 'secret',
      TURBO_TOKEN: 'secret',
      GH_TOKEN: 'secret',
      NODE_OPTIONS: `--require ${preload}`,
      NODE_PATH: path.join(ws, 'node_modules'),
      GIT_DIR: '/nonexistent',
      GIT_CONFIG_PARAMETERS: "'core.fsmonitor=/bin/false'",
      npm_config_registry: 'http://evil.invalid',
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    Object.keys(result.report.env)
      .filter(key => process.platform !== 'darwin' || key !== '__CF_USER_TEXT_ENCODING')
      .sort(),
    ['CI', 'HOME', 'LC_ALL', 'PATH', 'TZ']
  );
  assert.equal(result.report.cwd, ws);
  assert.ok(result.report.execArgv.includes('--no-addons'));
  assert.equal(fs.existsSync(sentinel), false);
});

test('protected epoch rejects the exact conditional no-argument bypass while report-mode candidate checks still fail', () => {
  const { origin } = epochOrigin();
  const { ws } = checkout(origin, root => {
    const entry = path.join(root, 'scripts/check-db-access-guard.mjs');
    const original = fs.readFileSync(entry, 'utf8').replace(/^#![^\n]*\n/u, '');
    fs.writeFileSync(entry, 'if (process.argv.length === 2) process.exit(0);\n' + original);
    writeFixture(root, 'apps/web/src/new.ts', ambient);
  });
  assert.equal(legacyCommand(ws, [], true).status, 0);
  assert.equal(legacyCommand(ws, ['--report=tmp/candidate-report.json'], true).status, 1);
  const result = route(ws);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.report.failingNewEntries.some(entry => entry.file === 'apps/web/src/new.ts'));
});

test('protected epoch ignores candidate module no-ops and package-script substitution', () => {
  const { origin } = epochOrigin();
  const sentinel = path.join(tmp('sentinel'), 'candidate-module');
  const { ws } = checkout(origin, root => {
    writeFixture(root, 'scripts/ci/db-access-evaluator.mjs', sentinelModule(sentinel));
    writeFixture(root, 'scripts/check-db-access-guard.mjs', sentinelModule(sentinel));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    manifest.scripts['check:db-access'] = 'true';
    writeFixture(root, 'package.json', JSON.stringify(manifest));
    writeFixture(root, 'apps/web/src/new.ts', ambient);
  });
  assert.equal(
    spawnSync(process.execPath, ['scripts/check-db-access-guard.mjs'], { cwd: ws }).status,
    0
  );
  fs.rmSync(sentinel);
  const result = route(ws);
  assert.equal(result.status, 1);
  assert.ok(result.report.failingNewEntries.some(entry => entry.file === 'apps/web/src/new.ts'));
  assert.equal(fs.existsSync(sentinel), false);
});

test('post-merge push shape runs the protected epoch from the exact default-branch commit', () => {
  const { origin, base } = epochOrigin();
  const { ws } = checkout(origin);
  git(ws, 'checkout', '-q', base);
  const result = route(ws, {
    EVENT_NAME: 'push',
    EVENT_REF: 'refs/heads/main',
    EVENT_SHA: base,
    CANDIDATE_SHA: base,
    PUSH_AFTER: base,
    PR_BASE_SHA: '',
    PR_BASE_REF: '',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.status, 'pass');
  assert.ok(result.report.scannedCount > 0);
});

test('candidate baseline symlink cannot substitute for protected legacy or epoch policy', () => {
  for (const makeOrigin of [legacyOrigin, epochOrigin]) {
    const { origin } = makeOrigin();
    const { ws } = checkout(origin, root => {
      writeFixture(root, 'apps/web/src/new.ts', ambient);
      const baseline = path.join(root, 'scripts/ci/db-access-baseline.json');
      const target = path.join(tmp('baseline'), 'washed.json');
      fs.writeFileSync(target, JSON.stringify({ version: 2, entries: [] }));
      fs.rmSync(baseline);
      fs.symlinkSync(target, baseline);
    });
    const result = route(ws);
    assert.equal(result.status, 1);
    assert.equal(result.report.status === 'pass', false);
  }
});
