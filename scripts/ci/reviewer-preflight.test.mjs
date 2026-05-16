import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const scriptPath = path.join(repoRoot, 'scripts/ci/reviewer-preflight.mjs');
const GIT_BIN = '/usr/bin/git';
const SAFE_EXEC_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });

function withTempRepo(callback) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-preflight-'));
  execFileSync(GIT_BIN, ['init'], { cwd: tmpDir, env: SAFE_EXEC_ENV, stdio: 'ignore' });
  execFileSync(GIT_BIN, ['config', 'user.email', 'test@example.com'], {
    cwd: tmpDir,
    env: SAFE_EXEC_ENV,
  });
  execFileSync(GIT_BIN, ['config', 'user.name', 'Test User'], {
    cwd: tmpDir,
    env: SAFE_EXEC_ENV,
  });
  execFileSync(GIT_BIN, ['config', 'commit.gpgsign', 'false'], {
    cwd: tmpDir,
    env: SAFE_EXEC_ENV,
  });

  try {
    callback(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function writeFile(root, file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function commitAll(root, message) {
  execFileSync(GIT_BIN, ['add', '.'], { cwd: root, env: SAFE_EXEC_ENV });
  execFileSync(GIT_BIN, ['commit', '-m', message], {
    cwd: root,
    env: SAFE_EXEC_ENV,
    stdio: 'ignore',
  });
}

function runPreflight(root, files = []) {
  return spawnSync(process.execPath, [scriptPath, ...files], {
    cwd: root,
    encoding: 'utf8',
    env: SAFE_EXEC_ENV,
  });
}

test('review preflight blocks changes to the Phase C proxy authority', () => {
  withTempRepo(root => {
    writeFile(root, 'apps/web/src/proxy.ts', 'export const value = 1;\n');
    commitAll(root, 'initial');

    writeFile(root, 'apps/web/src/proxy.ts', 'export const value = 2;\n');
    const result = runPreflight(root, ['apps/web/src/proxy.ts']);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Phase C routing authority/u);
  });
});

test('review preflight blocks hard-coded local URLs in production app source', () => {
  withTempRepo(root => {
    writeFile(
      root,
      'apps/web/src/lib/example.ts',
      'export const url = "http://127.0.0.1:54321";\n'
    );
    commitAll(root, 'initial');

    const result = runPreflight(root, ['apps/web/src/lib/example.ts']);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /hard-codes local URL/u);
  });
});

test('review preflight only checks newly added production lines by default', () => {
  withTempRepo(root => {
    writeFile(
      root,
      'apps/web/src/lib/example.ts',
      'export const existing = "http://127.0.0.1:54321";\n'
    );
    commitAll(root, 'initial');

    writeFile(
      root,
      'apps/web/src/lib/example.ts',
      [
        'export const existing = "http://127.0.0.1:54321";',
        'export const changed = true;',
        '',
      ].join('\n')
    );

    const result = runPreflight(root);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /review-preflight passed/u);
  });
});

test('review preflight blocks newly added optional-binding empty catches', () => {
  withTempRepo(root => {
    writeFile(root, 'apps/web/src/lib/example.ts', 'export const value = 1;\n');
    commitAll(root, 'initial');

    writeFile(
      root,
      'apps/web/src/lib/example.ts',
      ['export function swallow() {', '  try {} catch {}', '}', ''].join('\n')
    );

    const result = runPreflight(root);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /empty catch block/u);
  });
});

test('review preflight allows local URLs in tests and config files', () => {
  withTempRepo(root => {
    writeFile(
      root,
      'apps/web/src/lib/example.test.ts',
      'export const url = "http://127.0.0.1:54321";\n'
    );
    writeFile(
      root,
      'apps/web/playwright.config.ts',
      'export const url = "http://127.0.0.1:3000";\n'
    );
    commitAll(root, 'initial');

    const result = runPreflight(root, [
      'apps/web/src/lib/example.test.ts',
      'apps/web/playwright.config.ts',
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /review-preflight passed/u);
  });
});

test('review preflight blocks unconditional Vercel deployment skips', () => {
  withTempRepo(root => {
    writeFile(
      root,
      'apps/web/vercel.json',
      JSON.stringify({ ignoreCommand: 'exit 0' }, null, 2)
    );
    commitAll(root, 'initial');

    const result = runPreflight(root, ['apps/web/vercel.json']);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unconditionally skips Vercel builds/u);
  });
});

test('review preflight allows deployment skips with an environment escape hatch', () => {
  withTempRepo(root => {
    writeFile(
      root,
      'apps/web/vercel.json',
      JSON.stringify(
        {
          ignoreCommand: 'if [ "$ENABLE_VERCEL_DEPLOYMENTS" = "1" ]; then exit 1; else exit 0; fi',
        },
        null,
        2
      )
    );
    commitAll(root, 'initial');

    const result = runPreflight(root, ['apps/web/vercel.json']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /review-preflight passed/u);
  });
});

test('review preflight blocks test-only values in production source', () => {
  withTempRepo(root => {
    writeFile(
      root,
      'apps/web/src/lib/auth-secret.ts',
      'export const secret = "test-secret-for-ci-only-do-not-use-in-production";\n'
    );
    commitAll(root, 'initial');

    const result = runPreflight(root, ['apps/web/src/lib/auth-secret.ts']);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /test-only configuration/u);
  });
});

test('review preflight warns on auth and tenant sensitive paths', () => {
  withTempRepo(root => {
    writeFile(root, 'packages/shared-auth/src/index.ts', 'export const auth = true;\n');
    commitAll(root, 'initial');

    const result = runPreflight(root, ['packages/shared-auth/src/index.ts']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /auth, tenant, or RLS-sensitive code/u);
    assert.match(result.stdout, /review-preflight passed/u);
  });
});
