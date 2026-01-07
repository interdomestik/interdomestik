import fs from 'fs';
import path from 'path';
import { REPO_ROOT, WEB_APP } from '../../utils/paths.js';
import { checkFileContains, checkFileExists } from './utils.js';

export async function auditCsp() {
  const proxyPath = path.join(WEB_APP, 'src/proxy.ts');
  const middlewarePath = path.join(WEB_APP, 'src/middleware.ts');
  const targetPath = fs.existsSync(middlewarePath) ? middlewarePath : proxyPath;

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
    issues.push('❌ Security entry point (middleware.ts or proxy.ts) missing');
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

function checkAuthFiles(checks: string[], issues: string[]) {
  const authFile = checkFileExists(path.join(WEB_APP, 'src/lib/auth.ts'), 'Server Auth Config');
  if (authFile.check) checks.push(authFile.check);
  if (authFile.issue) issues.push(authFile.issue);

  const clientFile = checkFileExists(
    path.join(WEB_APP, 'src/lib/auth-client.ts'),
    'Client Auth Config'
  );
  if (clientFile.check) checks.push(clientFile.check);
  if (clientFile.issue) issues.push(clientFile.issue);
}

function checkMiddleware(checks: string[], issues: string[]) {
  const proxyPath = path.join(WEB_APP, 'src/proxy.ts');
  const middlewarePath = path.join(WEB_APP, 'src/middleware.ts');
  const targetPath = fs.existsSync(middlewarePath) ? middlewarePath : proxyPath;
  const middlewareCheck = checkFileExists(targetPath, 'Route Protection');
  if (middlewareCheck.check) checks.push(middlewareCheck.check);
  if (middlewareCheck.issue) issues.push(middlewareCheck.issue);
}

function checkEnvVars(checks: string[], issues: string[]) {
  const envPath = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    issues.push('❌ .env file missing in root');
    return;
  }

  const secretCheck = checkFileContains(envPath, 'BETTER_AUTH_SECRET', 'BETTER_AUTH_SECRET');
  if (secretCheck.check) checks.push(secretCheck.check);
  if (secretCheck.issue) issues.push(secretCheck.issue);

  const githubCheck = checkFileContains(envPath, 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_ID');
  if (githubCheck.check) checks.push(githubCheck.check);
  if (githubCheck.issue) issues.push(githubCheck.issue);
}

export async function auditAuth() {
  const checks: string[] = [];
  const issues: string[] = [];

  checkAuthFiles(checks, issues);
  checkMiddleware(checks, issues);
  checkEnvVars(checks, issues);

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
