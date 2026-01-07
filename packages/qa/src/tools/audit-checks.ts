import fs from 'fs';
import path from 'path';
import { execAsync } from '../utils/exec.js';
import { REPO_ROOT, WEB_APP } from '../utils/paths.js';

// Helper to check file existence
function checkFileExists(
  filePath: string,
  description: string
): { check: string | null; issue: string | null } {
  if (fs.existsSync(filePath)) {
    return { check: `✅ ${description} exists`, issue: null };
  }
  return { check: null, issue: `❌ Missing ${description} (${path.basename(filePath)})` };
}

// Helper to check file content
function checkFileContains(
  filePath: string,
  search: string,
  description: string
): { check: string | null; issue: string | null } {
  if (!fs.existsSync(filePath)) {
    return { check: null, issue: `❌ Missing file for ${description} check` };
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes(search)) {
    return { check: `✅ ${description} configured`, issue: null };
  }
  return { check: null, issue: `⚠️ ${description} not found in ${path.basename(filePath)}` };
}

export async function auditDependencies() {
  const packageJsonPath = path.join(REPO_ROOT, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Critical: Root package.json missing at ${packageJsonPath}\nResolved repo root: ${REPO_ROOT}`,
        },
      ],
    };
  }

  await execAsync('git branch --show-current', { cwd: REPO_ROOT }).catch(() => ({
    stdout: 'unknown',
  }));
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const checks: string[] = [];
  if (pkg.workspaces) checks.push('✅ Workspaces configured');
  if (pkg.scripts?.dev) checks.push("✅ 'dev' script present");
  if (pkg.scripts?.build) checks.push("✅ 'build' script present");
  if (pkg.scripts?.lint) checks.push("✅ 'lint' script present");

  return {
    content: [
      {
        type: 'text',
        text: `DEPENDENCY AUDIT: SUCCESS\n\nTARGET: ${REPO_ROOT}\nPACKAGE: ${
          pkg.name || 'unknown'
        }\n\nCHECKS:\n${checks.join('\n')}`,
      },
    ],
  };
}

export async function auditSupabase() {
  const configPath = path.join(REPO_ROOT, 'supabase/config.toml');
  if (fs.existsSync(configPath)) {
    return {
      content: [
        { type: 'text', text: 'SUPABASE AUDIT: SUCCESS\n\n✅ supabase/config.toml exists' },
      ],
    };
  }
  return {
    content: [{ type: 'text', text: 'SUPABASE AUDIT: WARNING\n\n❌ supabase/config.toml missing' }],
  };
}

export async function auditAccessibility() {
  const packageJsonPath = path.join(WEB_APP, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { content: [{ type: 'text', text: '❌ Critical: Web package.json missing' }] };
  }
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  const checks: string[] = [];
  const issues: string[] = [];

  if (allDeps['@axe-core/react'] || allDeps['jest-axe'] || allDeps['axe-core']) {
    checks.push('✅ Axe accessibility tools installed');
  } else {
    issues.push('❌ Missing accessibility tools (@axe-core/react or similar)');
  }

  const status = issues.length === 0 ? 'SUCCESS' : 'WARNING';
  return {
    content: [
      {
        type: 'text',
        text: `ACCESSIBILITY AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${
          issues.length > 0 ? issues.join('\n') : 'None'
        }`,
      },
    ],
  };
}

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

export async function auditPerformance() {
  const nextConfigPath = path.join(WEB_APP, 'next.config.mjs');
  const checks: string[] = [];
  const issues: string[] = [];

  if (fs.existsSync(nextConfigPath)) {
    checks.push('✅ next.config.mjs exists');
    const content = fs.readFileSync(nextConfigPath, 'utf-8');
    if (content.includes('bundleAnalyzer')) {
      checks.push('✅ Bundle Analyzer configured');
    } else {
      issues.push('⚠️ Bundle Analyzer not configured (recommended for perf checking)');
    }
  } else {
    issues.push('❌ next.config.mjs missing');
  }

  const status = issues.length === 0 ? 'SUCCESS' : 'WARNING';
  return {
    content: [
      {
        type: 'text',
        text: `PERFORMANCE AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${
          issues.length > 0 ? issues.join('\n') : 'None'
        }`,
      },
    ],
  };
}

export async function auditNavigation() {
  const issues: string[] = [];
  const checks: string[] = [];

  const hasRootLayout = fs.existsSync(path.join(WEB_APP, 'src/app/layout.tsx'));
  const hasLocaleLayout = fs.existsSync(path.join(WEB_APP, 'src/app/[locale]/layout.tsx'));
  const hasRoutingConfig = fs.existsSync(path.join(WEB_APP, 'src/i18n/routing.ts'));
  const hasNavigationHelper = fs.existsSync(path.join(WEB_APP, 'src/i18n/navigation.ts'));

  if (hasNavigationHelper) {
    checks.push('✅ Navigation Helper (src/i18n/navigation.ts) exists');
  }

  // I18n pattern (locale layout without separate root layout is valid in some configs, but usually we want both or specific setup)
  if (hasLocaleLayout && hasRoutingConfig) {
    checks.push('✅ Locale Layout (src/app/[locale]/layout.tsx) exists');
    checks.push('✅ Routing Config (src/i18n/routing.ts) exists');
    if (hasRootLayout) {
      checks.push('✅ Root Layout (src/app/layout.tsx) exists');
    } else {
      checks.push('ℹ️  Root Layout not present (using i18n locale-based routing pattern)');
    }

    return {
      content: [
        {
          type: 'text',
          text: `NAVIGATION AUDIT: SUCCESS\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\nNone`,
        },
      ],
    };
  }

  // Fallback checks for issues
  if (hasRootLayout) checks.push('✅ Root Layout (src/app/layout.tsx) exists');
  else issues.push('❌ Missing Root Layout (src/app/layout.tsx)');

  if (hasLocaleLayout) checks.push('✅ Locale Layout (src/app/[locale]/layout.tsx) exists');
  else issues.push('❌ Missing Locale Layout (src/app/[locale]/layout.tsx)');

  if (hasRoutingConfig) checks.push('✅ Routing Config (src/i18n/routing.ts) exists');
  else issues.push('❌ Missing Routing Config (src/i18n/routing.ts)');

  const status = issues.length === 0 ? 'SUCCESS' : 'WARNING';
  return {
    content: [
      {
        type: 'text',
        text: `NAVIGATION AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${
          issues.length > 0 ? issues.join('\n') : 'None'
        }`,
      },
    ],
  };
}

export async function auditAuth() {
  const checks: string[] = [];
  const issues: string[] = [];

  const authFile = checkFileExists(path.join(WEB_APP, 'src/lib/auth.ts'), 'Server Auth Config');
  if (authFile.check) checks.push(authFile.check);
  if (authFile.issue) issues.push(authFile.issue);

  const clientFile = checkFileExists(
    path.join(WEB_APP, 'src/lib/auth-client.ts'),
    'Client Auth Config'
  );
  if (clientFile.check) checks.push(clientFile.check);
  if (clientFile.issue) issues.push(clientFile.issue);

  // Check Middleware
  const proxyPath = path.join(WEB_APP, 'src/proxy.ts');
  const middlewarePath = path.join(WEB_APP, 'src/middleware.ts');
  const targetPath = fs.existsSync(middlewarePath) ? middlewarePath : proxyPath;
  const middlewareCheck = checkFileExists(targetPath, 'Route Protection');
  if (middlewareCheck.check) checks.push(middlewareCheck.check);
  if (middlewareCheck.issue) issues.push(middlewareCheck.issue);

  // Check Env Vars
  const envPath = path.join(REPO_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const secretCheck = checkFileContains(envPath, 'BETTER_AUTH_SECRET', 'BETTER_AUTH_SECRET');
    if (secretCheck.check) checks.push(secretCheck.check);
    if (secretCheck.issue) issues.push(secretCheck.issue);

    const githubCheck = checkFileContains(envPath, 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_ID');
    if (githubCheck.check) checks.push(githubCheck.check);
    if (githubCheck.issue) issues.push(githubCheck.issue);
  } else {
    issues.push('❌ .env file missing in root');
  }

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

export async function auditEnv() {
  const requiredVars = [
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];

  const missing: string[] = [];
  const present: string[] = [];
  const envPath = path.join(REPO_ROOT, '.env');

  if (!fs.existsSync(envPath)) {
    return { content: [{ type: 'text', text: '❌ CRITICAL: No .env file found in root!' }] };
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  requiredVars.forEach(v => {
    if (envContent.includes(`${v}=`) && !envContent.includes(`${v}= `)) {
      present.push(v);
    } else {
      const match = envContent.match(new RegExp(`${v}=(.*)`));
      if (match && match[1] && match[1].trim().length > 0) {
        present.push(v);
      } else {
        missing.push(v);
      }
    }
  });

  return {
    content: [
      {
        type: 'text',
        text: `ENV AUDIT\n\nPRESENT:\n${present.map(p => `✅ ${p}`).join('\n')}\n\nMISSING:\n${missing
          .map(m => `❌ ${m}`)
          .join('\n')}`,
      },
    ],
  };
}
