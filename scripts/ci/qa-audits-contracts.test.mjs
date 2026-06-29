import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const tsxLoader = path.join(repoRoot, 'node_modules/tsx/dist/loader.mjs');

function makeTempRepo({ envFileName = '.env.local', envLines = [] } = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-qa-audit-'));

  fs.writeFileSync(path.join(tempRoot, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
  fs.mkdirSync(path.join(tempRoot, 'apps/web/src/lib'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, 'apps/web/src/lib/auth.ts'), 'export const auth = {};\n');
  fs.writeFileSync(
    path.join(tempRoot, 'apps/web/src/lib/auth-client.ts'),
    'export const authClient = {};\n'
  );
  fs.writeFileSync(path.join(tempRoot, 'apps/web/src/proxy.ts'), 'export function proxy() {}\n');

  if (envFileName) {
    fs.writeFileSync(path.join(tempRoot, envFileName), `${envLines.join('\n')}\n`);
  }

  return tempRoot;
}

function runModuleExpression(modulePath, expression, options = {}) {
  const { cwd = repoRoot, env = {} } = options;
  const moduleUrl = pathToFileURL(path.join(repoRoot, modulePath)).href;
  const script = `const mod = await import(${JSON.stringify(moduleUrl)});
const result = await (${expression});
console.log(JSON.stringify(result));`;

  const stdout = execFileSync(process.execPath, ['--import', tsxLoader, '--eval', script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

  return JSON.parse(stdout);
}

function runAudit(modulePath, exportName, fakeRepoRoot) {
  const canonicalFakeRepoRoot = fs.realpathSync.native(fakeRepoRoot);
  return runModuleExpression(modulePath, `mod[${JSON.stringify(exportName)}]()`, {
    cwd: canonicalFakeRepoRoot,
    env: { MCP_REPO_ROOT: canonicalFakeRepoRoot },
  });
}

function getText(result) {
  return result.content.find(item => item.type === 'text')?.text ?? '';
}

test('auditEnv accepts .env.local as the repo root env file', () => {
  const fakeRepoRoot = makeTempRepo({
    envFileName: '.env.local',
    envLines: [
      'DATABASE_URL=postgresql://localhost/test',
      'BETTER_AUTH_SECRET=test-secret',
      'NEXT_PUBLIC_APP_URL=http://localhost:3000',
      'NEXT_PUBLIC_SUPABASE_URL=https://supabase.example',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key',
    ],
  });

  const result = runAudit('packages/qa/src/tools/audits/env.ts', 'auditEnv', fakeRepoRoot);
  const text = getText(result);

  assert.match(text, /ENV AUDIT/);
  assert.doesNotMatch(text, /No \.env file found in root/i);
  assert.match(text, /✅ DATABASE_URL/);
  assert.match(text, /✅ BETTER_AUTH_SECRET/);
});

test('auditAuth accepts .env.local and does not require GitHub OAuth credentials', () => {
  const fakeRepoRoot = makeTempRepo({
    envFileName: '.env.local',
    envLines: ['BETTER_AUTH_SECRET=test-secret'],
  });

  const result = runAudit('packages/qa/src/tools/audits/security.ts', 'auditAuth', fakeRepoRoot);
  const text = getText(result);

  assert.match(text, /AUTH AUDIT: SUCCESS/);
  assert.doesNotMatch(text, /\.env file missing in root/i);
  assert.doesNotMatch(text, /GITHUB_CLIENT_ID/i);
  assert.match(text, /BETTER_AUTH_SECRET/);
});

test('repo root helper ignores MCP_REPO_ROOT values without repo markers', () => {
  const invalidRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-qa-invalid-root-'));
  const result = runModuleExpression(
    'packages/qa/src/utils/paths.ts',
    '({ repoRoot: mod.REPO_ROOT, source: mod.REPO_ROOT_SOURCE })',
    { env: { MCP_REPO_ROOT: invalidRoot } }
  );

  assert.equal(result.repoRoot, fs.realpathSync.native(repoRoot));
  assert.equal(result.source, 'module-relative');
});

test('repo path helper rejects traversal, absolute paths, and symlink escapes', () => {
  const fakeRepoRoot = makeTempRepo({ envFileName: null });
  const canonicalFakeRepoRoot = fs.realpathSync.native(fakeRepoRoot);
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-qa-outside-'));
  const outsideFile = path.join(outsideRoot, 'secret.txt');
  fs.writeFileSync(outsideFile, 'outside repo');

  const candidates = ['../outside.txt', outsideFile];
  try {
    fs.symlinkSync(outsideRoot, path.join(fakeRepoRoot, 'outside-link'), 'dir');
    candidates.push('outside-link/secret.txt');
  } catch {
    // Some local filesystems disallow symlinks; traversal and absolute-path coverage still applies.
  }

  const result = runModuleExpression(
    'packages/qa/src/utils/paths.ts',
    `(() => {
      const outcomes = {};
      for (const candidate of ${JSON.stringify(candidates)}) {
        try {
          mod.resolveRepoPath(candidate);
          outcomes[candidate] = 'allowed';
        } catch (error) {
          outcomes[candidate] = error.message;
        }
      }
      outcomes.safe = mod.resolveRepoPath('apps/web/src/proxy.ts').relativePath;
      return outcomes;
    })()`,
    {
      cwd: canonicalFakeRepoRoot,
      env: { MCP_REPO_ROOT: canonicalFakeRepoRoot },
    }
  );

  assert.equal(result.safe, 'apps/web/src/proxy.ts');
  assert.match(result['../outside.txt'], /escapes repository root/);
  assert.match(result[outsideFile], /repository-relative/);
  if (candidates.includes('outside-link/secret.txt')) {
    assert.match(result['outside-link/secret.txt'], /escapes repository root/);
  }
});
