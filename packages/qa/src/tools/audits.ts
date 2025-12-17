import fs from 'fs';
import path from 'path';
import { execAsync } from '../utils/exec.js';
import { REPO_ROOT, WEB_APP } from '../utils/paths.js';

export async function auditDependencies() {
  let packageJsonPath = path.join(REPO_ROOT, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    packageJsonPath = path.join(process.cwd(), 'package.json');
  }

  if (!fs.existsSync(packageJsonPath)) {
    return { content: [{ type: 'text', text: `❌ Critical: Root package.json missing at ${packageJsonPath}` }] };
  }

  await execAsync('git branch --show-current', { cwd: REPO_ROOT }).catch(() => ({ stdout: 'unknown' }));
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const checks: string[] = [];
  if (pkg.workspaces) checks.push('✅ Workspaces configured');
  if (pkg.scripts?.dev) checks.push("✅ 'dev' script present");
  if (pkg.scripts?.build) checks.push("✅ 'build' script present");
  if (pkg.scripts?.lint) checks.push("✅ 'lint' script present");

  return {
    content: [{ type: 'text', text: `DEPENDENCY AUDIT: SUCCESS\n\nCHECKS:\n${checks.join('\n')}` }],
  };
}

export async function auditSupabase() {
  const configPath = path.join(REPO_ROOT, 'supabase/config.toml');
  if (fs.existsSync(configPath)) {
    return { content: [{ type: 'text', text: 'SUPABASE AUDIT: SUCCESS\n\n✅ supabase/config.toml exists' }] };
  }
  return { content: [{ type: 'text', text: 'SUPABASE AUDIT: WARNING\n\n❌ supabase/config.toml missing' }] };
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
  const middlewarePath = path.join(WEB_APP, 'src/proxy.ts');
  const checks: string[] = [];
  const issues: string[] = [];

  if (fs.existsSync(middlewarePath)) {
    const content = fs.readFileSync(middlewarePath, 'utf-8');
    if (content.includes('Content-Security-Policy') || content.includes('csp:')) {
      checks.push('✅ CSP found in proxy.ts');
    } else {
      issues.push('⚠️ CSP header not explicitly set in proxy.ts');
    }
  } else {
    issues.push('❌ proxy.ts missing');
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

  if (fs.existsSync(path.join(WEB_APP, 'src/app/layout.tsx'))) {
    checks.push('✅ Root Layout (src/app/layout.tsx) exists');
  } else {
    issues.push('❌ Missing Root Layout (src/app/layout.tsx)');
  }

  if (fs.existsSync(path.join(WEB_APP, 'src/app/[locale]/layout.tsx'))) {
    checks.push('✅ Locale Layout (src/app/[locale]/layout.tsx) exists');
  } else {
    issues.push('❌ Missing Locale Layout (src/app/[locale]/layout.tsx)');
  }

  if (fs.existsSync(path.join(WEB_APP, 'src/i18n/routing.ts'))) {
    checks.push('✅ Routing Config (src/i18n/routing.ts) exists');
  } else {
    issues.push('❌ Missing Routing Config (src/i18n/routing.ts)');
  }

  if (fs.existsSync(path.join(WEB_APP, 'src/i18n/navigation.ts'))) {
    checks.push('✅ Navigation Helper (src/i18n/navigation.ts) exists');
  }

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
  const issues: string[] = [];
  const checks: string[] = [];

  if (fs.existsSync(path.join(WEB_APP, 'src/lib/auth.ts'))) {
    checks.push('✅ src/lib/auth.ts exists');
  } else {
    issues.push('❌ Missing src/lib/auth.ts (Server Config)');
  }

  if (fs.existsSync(path.join(WEB_APP, 'src/lib/auth-client.ts'))) {
    checks.push('✅ src/lib/auth-client.ts exists');
  } else {
    issues.push('❌ Missing src/lib/auth-client.ts (Client Config)');
  }

  if (fs.existsSync(path.join(WEB_APP, 'src/proxy.ts'))) {
    checks.push('✅ src/proxy.ts exists');
  } else {
    issues.push('❌ Missing src/proxy.ts (Route Protection)');
  }

  const envPath = path.join(REPO_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    if (envContent.includes('BETTER_AUTH_SECRET')) {
      checks.push('✅ BETTER_AUTH_SECRET configured');
    } else {
      issues.push('❌ Missing BETTER_AUTH_SECRET in .env');
    }
    if (envContent.includes('GITHUB_CLIENT_ID')) {
      checks.push('✅ GITHUB_CLIENT_ID configured');
    } else {
      issues.push('❌ Missing GITHUB_CLIENT_ID in .env');
    }
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
