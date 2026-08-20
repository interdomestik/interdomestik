import fs from 'node:fs';
import path from 'node:path';
import { resolveToolRepoPath } from '../../utils/tool-repo-root.js';
import { checkFileContains, checkFileExists, findRootEnvFile } from './utils.js';

export async function auditCsp(repoRoot: string) {
  const webApp = resolveToolRepoPath(repoRoot, 'apps/web').resolvedPath;
  const proxyPath = path.join(webApp, 'src/proxy.ts');
  const targetPath = proxyPath;

  const checks: string[] = [];
  const issues: string[] = [];

  if (fs.existsSync(targetPath)) {
    const filename = path.basename(targetPath);
    checks.push(`✅ ${filename} exists`);
    const content = fs.readFileSync(targetPath, 'utf-8');
    if (content.includes('Content-Security-Policy') || content.includes('csp:')) {
      checks.push(`✅ CSP found in ${filename}`);
    } else {
      issues.push(`⚠️ CSP header not explicitly set in ${filename}`);
    }
  } else {
    issues.push('❌ Security entry point (proxy.ts) missing');
  }

  const status = issues.length === 0 ? 'SUCCESS' : 'WARNING';
  return {
    content: [
      {
        type: 'text',
        text: `CSP AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${
          issues.length > 0 ? issues.join('\n') : 'None'
        }`,
      },
    ],
  };
}

function checkAuthFiles(webApp: string, checks: string[], issues: string[]) {
  const authFile = checkFileExists(path.join(webApp, 'src/lib/auth.ts'), 'Server Auth Config');
  if (authFile.check) checks.push(authFile.check);
  if (authFile.issue) issues.push(authFile.issue);

  const clientFile = checkFileExists(
    path.join(webApp, 'src/lib/auth-client.ts'),
    'Client Auth Config'
  );
  if (clientFile.check) checks.push(clientFile.check);
  if (clientFile.issue) issues.push(clientFile.issue);
}

function checkProxy(webApp: string, checks: string[], issues: string[]) {
  const proxyPath = path.join(webApp, 'src/proxy.ts');
  const proxyCheck = checkFileExists(proxyPath, 'Proxy');
  if (proxyCheck.check) checks.push(proxyCheck.check);
  if (proxyCheck.issue) issues.push(proxyCheck.issue);
}

function checkEnvVars(repoRoot: string, checks: string[], issues: string[]) {
  const envPath = findRootEnvFile(repoRoot);
  if (!envPath || !fs.existsSync(envPath)) {
    issues.push(
      '❌ No supported env file found in root (.env.local, .env.development.local, .env)'
    );
    return;
  }

  const secretCheck = checkFileContains(envPath, 'BETTER_AUTH_SECRET', 'BETTER_AUTH_SECRET');
  if (secretCheck.check) checks.push(secretCheck.check);
  if (secretCheck.issue) issues.push(secretCheck.issue);
}

export async function auditAuth(repoRoot: string) {
  const checks: string[] = [];
  const issues: string[] = [];
  const webApp = resolveToolRepoPath(repoRoot, 'apps/web').resolvedPath;

  checkAuthFiles(webApp, checks, issues);
  checkProxy(webApp, checks, issues);
  checkEnvVars(repoRoot, checks, issues);

  const status = issues.length === 0 ? 'SUCCESS' : 'WARNING';
  return {
    content: [
      {
        type: 'text',
        text: `AUTH AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${
          issues.length > 0 ? issues.join('\n') : 'None'
        }`,
      },
    ],
  };
}
