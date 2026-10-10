import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ADOPTION_COMMIT,
  ADOPTION_TREE,
  TS,
  git,
  tmp,
  writeFile,
} from './db-access-required-git.mjs';
import { actualOrigin } from './db-access-required-origins.mjs';
import {
  ambient,
  assertRejected,
  fakeEpoch,
  forgingGuard,
  nodeEnv,
  noopCi,
  openPullRequest,
  route,
  withCompiler,
} from './db-access-required-fixtures.mjs';

const unsafe = 'apps/web/src/new.ts';
const origin = actualOrigin();

test('candidate modules, compiler, preload and selector-like inputs never execute; e113 flags the merge', () => {
  const sentinel = path.join(tmp('sentinel'), 'candidate');
  const preload = path.join(tmp('preload'), 'evil.cjs');
  fs.writeFileSync(preload, `require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'preload');`);
  const pr = openPullRequest(origin, root => {
    for (const file of [
      'scripts/ci/db-access-evaluator.mjs',
      'scripts/ci/db-access-trust.mjs',
      'scripts/ci/db-access-adoption.mjs',
    ])
      writeFile(root, file, forgingGuard(sentinel));
    writeFile(
      root,
      'node_modules/typescript/package.json',
      JSON.stringify({ name: 'typescript', version: TS, main: 'index.js' })
    );
    writeFile(
      root,
      'node_modules/typescript/index.js',
      `require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'compiler');`
    );
    git(root, 'add', '-f', 'node_modules');
    writeFile(root, unsafe, ambient);
  });
  const result = route(
    pr,
    {},
    {
      DATABASE_URL: 'postgres://secret',
      BETTER_AUTH_SECRET: 'secret',
      GH_TOKEN: 'ghs_fixture-credential-never-logged',
      NODE_OPTIONS: `--require ${preload}`,
      NODE_PATH: path.join(pr.ws, 'node_modules'),
      GIT_DIR: '/nonexistent',
      GIT_CONFIG_PARAMETERS: "'core.fsmonitor=/bin/false'",
      npm_config_registry: 'http://evil.invalid',
      SOURCE_COMMIT: pr.head,
      SOURCE_TREE: git(pr.ws, 'rev-parse', `${pr.head}^{tree}`),
      GUARD_SOURCE_REF: 'refs/heads/main',
      DB_GUARD_SOURCE_COMMIT: pr.head,
      PROTECTED_SHA: pr.base,
      TENANT_GUARD_BASE: pr.head,
    }
  );
  assertRejected(result, unsafe);
  assert.equal(fs.existsSync(sentinel), false);
  assert.doesNotMatch(result.stdout + result.stderr, /ghs_fixture/u);
});

test('candidate deleting or no-oping CI cannot waive the new ambient-query verdict', () => {
  for (const noop of [false, true]) {
    const pr = openPullRequest(origin, root => {
      fs.rmSync(path.join(root, '.github'), { recursive: true, force: true });
      if (noop) writeFile(root, '.github/workflows/ci.yml', noopCi);
      writeFile(root, unsafe, ambient);
    });
    assertRejected(route(pr), unsafe);
  }
});

test('candidate package script cannot replace the approved guard invocation', () => {
  const pr = openPullRequest(origin, root => {
    const file = path.join(root, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.scripts['check:db-access'] = 'true';
    writeFile(root, 'package.json', `${JSON.stringify(manifest, null, 2)}\n`);
    writeFile(root, unsafe, ambient);
  });
  assertRejected(route(pr));
});

test('conditional no-arg entrypoint cannot waive the new ambient-query verdict', () => {
  const pr = openPullRequest(origin, root => {
    const entry = path.join(root, 'scripts/check-db-access-guard.mjs');
    const original = fs.readFileSync(entry, 'utf8').replace(/^#![^\n]*\n/u, '');
    writeFile(
      root,
      'scripts/check-db-access-guard.mjs',
      `if (process.argv.length === 2) process.exit(0);\n${original}`
    );
    writeFile(root, unsafe, ambient);
  });
  // Precondition: the original conditional no-arg bypass really passes the candidate's own guard.
  const bypass = withCompiler(pr.ws, () =>
    spawnSync(process.execPath, ['scripts/check-db-access-guard.mjs'], {
      cwd: pr.ws,
      env: nodeEnv,
      encoding: 'utf8',
    })
  );
  assert.equal(bypass.status, 0, bypass.stderr);
  assertRejected(route(pr), unsafe);
});

test('candidate baseline, resolver, adoption and symlink edits cannot re-anchor e113 trust', () => {
  for (const [mutate, reason] of [
    [
      root =>
        writeFile(
          root,
          'scripts/ci/db-access-baseline.json',
          JSON.stringify({ version: 2, entries: [] })
        ),
      /baseline modified/u,
    ],
    [
      root =>
        writeFile(
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
        writeFile(
          root,
          'scripts/ci/db-access-adoption.mjs',
          fakeEpoch(ADOPTION_COMMIT, ADOPTION_TREE)
        );
        writeFile(root, unsafe, ambient);
      },
      /apps\/web\/src\/new\.ts/u,
    ],
    [
      root => {
        writeFile(root, unsafe, ambient);
        const washed = path.join(tmp('baseline'), 'washed.json');
        fs.writeFileSync(washed, JSON.stringify({ version: 2, entries: [] }));
        const baseline = path.join(root, 'scripts/ci/db-access-baseline.json');
        fs.rmSync(baseline);
        fs.symlinkSync(washed, baseline);
      },
      /./u,
    ],
  ]) {
    const result = route(openPullRequest(origin, mutate));
    assertRejected(result);
    assert.match(JSON.stringify(result.report ?? null) + result.stderr, reason);
  }
});
