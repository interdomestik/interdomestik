import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();

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

function runAudit(modulePath, exportName, fakeRepoRoot) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, modulePath)).href;
  const script = `
    const mod = await import(${JSON.stringify(moduleUrl)});
    const result = await mod[${JSON.stringify(exportName)}]();
    console.log(JSON.stringify(result));
  `;

  const stdout = execFileSync(process.execPath, ['--import', 'tsx', '--eval', script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      MCP_REPO_ROOT: fakeRepoRoot,
    },
    encoding: 'utf8',
  });

  return JSON.parse(stdout);
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
