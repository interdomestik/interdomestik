import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helper = path.join(rootDir, 'scripts/ci/run-with-vercel-env-file.mjs');

function withTempRepo(callback) {
  const repo = mkdtempSync(path.join(tmpdir(), 'vercel-env-helper-'));
  try {
    mkdirSync(path.join(repo, '.vercel'));
    callback(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

function runHelper(cwd, args, env = {}, nodePath = process.execPath) {
  return spawnSync(nodePath, [helper, ...args], {
    cwd,
    env: {
      PATH: process.env.PATH,
      ...env,
    },
    encoding: 'utf8',
  });
}

function writePreviewEnv(repo, body) {
  writeFileSync(path.join(repo, '.vercel/.env.preview.local'), body, 'utf8');
}

function writeProductionEnv(repo, body) {
  writeFileSync(path.join(repo, '.vercel/.env.production.local'), body, 'utf8');
}

function writeFakeNodeBin(repo, includeNpx = true) {
  const binDir = path.join(repo, 'bin');
  mkdirSync(binDir);
  const nodePath = path.join(binDir, 'node');
  copyFileSync(process.execPath, nodePath);
  chmodSync(nodePath, 0o755);
  if (!includeNpx) return nodePath;
  const npxPath = path.join(binDir, 'npx');
  writeFileSync(
    npxPath,
    '#!/bin/sh\nprintf "%s\\n" "$DATABASE_URL" "$DATABASE_URL_RLS"\nprintf "args:%s\\n" "$*"\n',
    'utf8'
  );
  chmodSync(npxPath, 0o755);
  return nodePath;
}

function runWithFakeNpx(repo, args, env = {}) {
  return runHelper(repo, args, env, writeFakeNodeBin(repo));
}

test('fails when the pulled Vercel env file is missing', () => {
  withTempRepo(repo => {
    const result = runHelper(repo, ['preview']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing Vercel environment file/u);
  });
});

test('fails before build when required database env keys are blank', () => {
  withTempRepo(repo => {
    writePreviewEnv(repo, 'DATABASE_URL="   "\nDATABASE_URL_RLS=""\n');

    const result = runHelper(repo, ['preview']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing required Vercel build env keys/u);
  });
});

test('loads pulled database env values over blank inherited values', () => {
  withTempRepo(repo => {
    writePreviewEnv(
      repo,
      'DATABASE_URL="postgresql://example/redacted"\nDATABASE_URL_RLS="postgresql://example/redacted-rls"\n'
    );
    const result = runWithFakeNpx(repo, ['preview'], {
      DATABASE_URL: '   ',
      DATABASE_URL_RLS: '',
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /postgresql:\/\/example\/redacted/u);
    assert.match(result.stdout, /postgresql:\/\/example\/redacted-rls/u);
    assert.match(result.stdout, /args:--yes vercel@latest build/u);
  });
});

test('keeps non-empty inherited database env values', () => {
  withTempRepo(repo => {
    writePreviewEnv(
      repo,
      'DATABASE_URL="postgresql://example/vercel"\nDATABASE_URL_RLS="postgresql://example/vercel-rls"\n'
    );
    const result = runWithFakeNpx(repo, ['preview'], {
      DATABASE_URL: 'postgresql://example/github',
      DATABASE_URL_RLS: 'postgresql://example/github-rls',
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /postgresql:\/\/example\/github/u);
    assert.doesNotMatch(result.stdout, /postgresql:\/\/example\/vercel/u);
  });
});

test('runs production builds with the Vercel production flag', () => {
  withTempRepo(repo => {
    writeProductionEnv(
      repo,
      'DATABASE_URL="postgresql://example/prod"\nDATABASE_URL_RLS="postgresql://example/prod-rls"\n'
    );
    const result = runWithFakeNpx(repo, ['production', '--prod']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /args:--yes vercel@latest build --prod/u);
  });
});

test('reports a clean failure when the Vercel build command cannot start', () => {
  withTempRepo(repo => {
    writePreviewEnv(
      repo,
      'DATABASE_URL="postgresql://example/redacted"\nDATABASE_URL_RLS="postgresql://example/redacted-rls"\n'
    );

    const result = runHelper(repo, ['preview'], {}, writeFakeNodeBin(repo, false));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Failed to run Vercel build command/u);
  });
});

test('rejects invalid Vercel target arguments', () => {
  withTempRepo(repo => {
    for (const [args, message] of [
      [['../preview'], /target must be preview or production/u],
      [['preview', '--prod'], /Only production builds may pass --prod/u],
    ]) {
      const result = runHelper(repo, args);
      assert.equal(result.status, 2);
      assert.match(result.stderr, message);
    }
  });
});
