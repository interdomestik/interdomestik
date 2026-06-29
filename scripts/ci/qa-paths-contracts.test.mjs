import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const tsxLoader = path.join(repoRoot, 'node_modules/tsx/dist/loader.mjs');
const pathsModule = pathToFileURL(path.join(repoRoot, 'packages/qa/src/utils/paths.ts')).href;

function makeTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-qa-paths-'));
  fs.writeFileSync(path.join(tempRoot, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
  fs.mkdirSync(path.join(tempRoot, 'apps/web'), { recursive: true });
  return fs.realpathSync.native(tempRoot);
}

function runPathExpression(expression, options = {}) {
  const { cwd = repoRoot, env = {} } = options;
  const script = `const mod = await import(${JSON.stringify(pathsModule)});
const result = await (${expression});
console.log(JSON.stringify(result));`;

  const stdout = execFileSync(process.execPath, ['--import', tsxLoader, '--eval', script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

  return JSON.parse(stdout);
}

test('canonicalizeRepoRoot rejects empty, relative, and NUL-containing candidates', () => {
  const result = runPathExpression(`(() => ({
    empty: mod.canonicalizeRepoRoot(''),
    dot: mod.canonicalizeRepoRoot('.'),
    relative: mod.canonicalizeRepoRoot('packages'),
    nul: mod.canonicalizeRepoRoot('packages\\0qa'),
    canonical: mod.canonicalizeRepoRoot(process.cwd())
  }))()`);

  assert.equal(result.empty, null);
  assert.equal(result.dot, null);
  assert.equal(result.relative, null);
  assert.equal(result.nul, null);
  assert.equal(result.canonical, fs.realpathSync.native(repoRoot));
});

test('resolveRepoPath rejects missing leaves beneath symlink escapes', () => {
  const fakeRepoRoot = makeTempRepo();
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-qa-outside-'));
  const candidates = ['apps/web/missing.txt'];

  try {
    fs.symlinkSync(outsideRoot, path.join(fakeRepoRoot, 'outside-link'), 'dir');
    candidates.push('outside-link/missing.txt');
  } catch {
    // Some local filesystems disallow symlinks; safe missing-leaf coverage still applies.
  }

  const result = runPathExpression(
    `(() => {
      const outcomes = {};
      for (const candidate of ${JSON.stringify(candidates)}) {
        try {
          outcomes[candidate] = mod.resolveRepoPath(candidate).relativePath;
        } catch (error) {
          outcomes[candidate] = error.message;
        }
      }
      return outcomes;
    })()`,
    {
      cwd: fakeRepoRoot,
      env: { MCP_REPO_ROOT: fakeRepoRoot },
    }
  );

  assert.equal(result['apps/web/missing.txt'], 'apps/web/missing.txt');
  if (candidates.includes('outside-link/missing.txt')) {
    assert.match(result['outside-link/missing.txt'], /escapes repository root/);
  }
});
