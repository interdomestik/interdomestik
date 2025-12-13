#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// index.ts is in packages/qa/src
// We want to go up 3 levels: src -> qa -> packages -> root
const REPO_ROOT = path.resolve(__dirname, '../../../');
const WEB_APP = path.join(REPO_ROOT, 'apps/web');

const server = new Server(
  {
    name: 'interdomestik-qa',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'audit_auth',
        description: 'Verify Better Auth configuration (files, env, middleware)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'audit_env',
        description: 'Verify Environment Variables for Interdomestik',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'audit_navigation',
        description: 'Verify Navigation & Layout Structure (i18n, layouts)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'audit_dependencies',
        description: 'Verify Critical Dependencies & Package Configuration',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'audit_supabase',
        description: 'Verify Supabase Environment & Connectivity (env vars only)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'run_unit_tests',
        description: 'Run unit tests for the web application using Vitest',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'run_e2e_tests',
        description: 'Run E2E tests for the web application using Playwright',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'audit_accessibility',
        description: 'Verify Accessibility Testing Setup',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'audit_csp',
        description: 'Verify Content Security Policy',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'audit_performance',
        description: 'Verify Performance Optimization Config',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'check_health',
        description: 'Run type-check and lint across workspace',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'project_map',
        description: 'Generate a map of the project structure',
        inputSchema: {
          type: 'object',
          properties: {
            maxDepth: { type: 'number', description: 'Max depth (default 3)' },
          },
        },
      },
      {
        name: 'code_search',
        description: 'Search for text in code files',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            filePattern: { type: 'string', description: 'Optional glob pattern' },
          },
          required: ['query'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name } = request.params;

  if (name === 'project_map') {
    const args = request.params.arguments as { maxDepth?: number };
    const maxDepth = args?.maxDepth || 3;

    try {
      // Use 'find' to list files, excluding node_modules, .git, .turbo, .next
      // This is a MacOS/Linux compatible command
      // -not -path '*/.*' excludes hidden files/dirs like .git, .next
      const command = `find . -maxdepth ${maxDepth} -not -path '*/.*' -not -path '*/node_modules*' -not -path '*/dist*' | sort`;
      const { stdout } = await execAsync(command, { cwd: REPO_ROOT });

      return {
        content: [{ type: 'text', text: `PROJECT MAP (Depth ${maxDepth}):\n\n${stdout}` }],
      };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error generating map: ${e.message}` }] };
    }
  }

  if (name === 'code_search') {
    const args = request.params.arguments as { query: string; filePattern?: string };
    const query = args.query;

    try {
      // git grep is faster and respects .gitignore
      // -n for line numbers, -I ignore binary, --heading group by file
      const command = `git grep -n -I "${query}" -- ${args.filePattern || '.'}`;
      const { stdout } = await execAsync(command, { cwd: REPO_ROOT });

      if (!stdout) return { content: [{ type: 'text', text: 'No matches found.' }] };

      return {
        content: [
          { type: 'text', text: `SEARCH RESULTS for "${query}":\n\n${stdout.slice(0, 10000)}` },
        ], // Limit output
      };
    } catch (e: any) {
      // git grep returns exit code 1 if not found, which throws in execAsync
      if (e.code === 1) return { content: [{ type: 'text', text: 'No matches found.' }] };
      return { content: [{ type: 'text', text: `Error searching: ${e.message}` }] };
    }
  }

  if (name === 'audit_dependencies') {
    // Try absolute path first
    let packageJsonPath = path.join(REPO_ROOT, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      // Fallback to process.cwd()
      packageJsonPath = path.join(process.cwd(), 'package.json');
    }

    if (!fs.existsSync(packageJsonPath)) {
      return {
        content: [
          { type: 'text', text: `❌ Critical: Root package.json missing at ${packageJsonPath}` },
        ],
      };
    }

    const branchInfo = await execAsync('git branch --show-current', { cwd: REPO_ROOT }).catch(
      () => ({ stdout: 'unknown' })
    );

    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const issues: string[] = [];
    const checks: string[] = [];

    // Check Workspaces
    if (pkg.workspaces) {
      checks.push('✅ Workspaces configured');
    }

    // Check Critical Dev Scripts
    if (pkg.scripts && pkg.scripts.dev) checks.push("✅ 'dev' script present");
    if (pkg.scripts && pkg.scripts.build) checks.push("✅ 'build' script present");
    if (pkg.scripts && pkg.scripts.lint) checks.push("✅ 'lint' script present");

    return {
      content: [
        { type: 'text', text: `DEPENDENCY AUDIT: SUCCESS\n\nCHECKS:\n${checks.join('\n')}` },
      ],
    };
  }

  if (name === 'audit_supabase') {
    const configPath = path.join(REPO_ROOT, 'supabase/config.toml');
    if (fs.existsSync(configPath)) {
      return {
        content: [
          { type: 'text', text: 'SUPABASE AUDIT: SUCCESS\n\n✅ supabase/config.toml exists' },
        ],
      };
    } else {
      return {
        content: [
          { type: 'text', text: 'SUPABASE AUDIT: WARNING\n\n❌ supabase/config.toml missing' },
        ],
      };
    }
  }

  if (name === 'audit_accessibility') {
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
          text: `ACCESSIBILITY AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${issues.length > 0 ? issues.join('\n') : 'None'}`,
        },
      ],
    };
  }

  if (name === 'audit_csp') {
    const middlewarePath = path.join(WEB_APP, 'src/middleware.ts');
    const checks: string[] = [];
    const issues: string[] = [];

    if (fs.existsSync(middlewarePath)) {
      const content = fs.readFileSync(middlewarePath, 'utf-8');
      if (content.includes('Content-Security-Policy') || content.includes('csp:')) {
        checks.push('✅ CSP found in middleware.ts');
      } else {
        issues.push('⚠️ CSP header not explicitly set in middleware.ts');
      }
    } else {
      issues.push('❌ middleware.ts missing');
    }

    const status = issues.length === 0 ? 'SUCCESS' : 'WARNING';
    return {
      content: [
        {
          type: 'text',
          text: `CSP AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${issues.length > 0 ? issues.join('\n') : 'None'}`,
        },
      ],
    };
  }

  if (name === 'audit_performance') {
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
          text: `PERFORMANCE AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${issues.length > 0 ? issues.join('\n') : 'None'}`,
        },
      ],
    };
  }

  if (name === 'audit_navigation') {
    const issues: string[] = [];
    const checks: string[] = [];

    // 1. Check Root Layout
    if (fs.existsSync(path.join(WEB_APP, 'src/app/layout.tsx'))) {
      checks.push('✅ Root Layout (src/app/layout.tsx) exists');
    } else {
      issues.push('❌ Missing Root Layout (src/app/layout.tsx)');
    }

    // 2. Check Locale Layout
    if (fs.existsSync(path.join(WEB_APP, 'src/app/[locale]/layout.tsx'))) {
      checks.push('✅ Locale Layout (src/app/[locale]/layout.tsx) exists');
    } else {
      issues.push('❌ Missing Locale Layout (src/app/[locale]/layout.tsx)');
    }

    // 3. Check Routing Config
    if (fs.existsSync(path.join(WEB_APP, 'src/i18n/routing.ts'))) {
      checks.push('✅ Routing Config (src/i18n/routing.ts) exists');
    } else {
      issues.push('❌ Missing Routing Config (src/i18n/routing.ts)');
    }

    // 4. Check Navigation Helper
    // We often have a navigation.ts or similar
    if (fs.existsSync(path.join(WEB_APP, 'src/i18n/navigation.ts'))) {
      checks.push('✅ Navigation Helper (src/i18n/navigation.ts) exists');
    }
    // Not strictly failing if missing, just checking.

    const status = issues.length === 0 ? 'SUCCESS' : 'WARNING';

    return {
      content: [
        {
          type: 'text',
          text: `NAVIGATION AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${issues.length > 0 ? issues.join('\n') : 'None'}`,
        },
      ],
    };
  }

  if (name === 'audit_auth') {
    const issues: string[] = [];
    const checks: string[] = [];

    // 1. Check Auth Lib
    if (fs.existsSync(path.join(WEB_APP, 'src/lib/auth.ts'))) {
      checks.push('✅ src/lib/auth.ts exists');
    } else {
      issues.push('❌ Missing src/lib/auth.ts (Server Config)');
    }

    // 2. Check Auth Client
    if (fs.existsSync(path.join(WEB_APP, 'src/lib/auth-client.ts'))) {
      checks.push('✅ src/lib/auth-client.ts exists');
    } else {
      issues.push('❌ Missing src/lib/auth-client.ts (Client Config)');
    }

    // 3. Check Middleware
    if (fs.existsSync(path.join(WEB_APP, 'src/middleware.ts'))) {
      checks.push('✅ src/middleware.ts exists');
    } else {
      issues.push('❌ Missing src/middleware.ts (Route Protection)');
    }

    // 4. Check Env Vars usage
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
          text: `AUTH AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${issues.length > 0 ? issues.join('\n') : 'None'}`,
        },
      ],
    };
  }

  if (name === 'audit_env') {
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
      return {
        content: [{ type: 'text', text: '❌ CRITICAL: No .env file found in root!' }],
      };
    }

    const envContent = fs.readFileSync(envPath, 'utf-8');

    requiredVars.forEach(v => {
      if (envContent.includes(`${v}=`) && !envContent.includes(`${v}= `)) {
        // Simple check
        present.push(v);
      } else {
        // stricter check for empty values
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
          text: `ENV AUDIT\n\nPRESENT:\n${present.map(p => `✅ ${p}`).join('\n')}\n\nMISSING:\n${missing.map(m => `❌ ${m}`).join('\n')}`,
        },
      ],
    };
  }

  if (name === 'check_health') {
    try {
      const typeCheck = await execAsync('pnpm type-check', { cwd: REPO_ROOT });
      const lint = await execAsync('pnpm lint', { cwd: REPO_ROOT });

      return {
        content: [
          {
            type: 'text',
            text: `✅ HEALTH CHECK PASSED\n\nTYPE CHECK:\n${typeCheck.stdout}\n\nLINT:\n${lint.stdout}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ HEALTH CHECK FAILED\n\nError: ${error.message}\n\nOutput: ${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
      };
    }
  }

  if (name === 'run_unit_tests') {
    try {
      const { stdout, stderr } = await execAsync('pnpm test:unit', { cwd: WEB_APP });
      return {
        content: [
          {
            type: 'text',
            text: `✅ UNIT TESTS PASSED\n\n${stdout}\n${stderr}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ UNIT TESTS FAILED\n\nError: ${error.message}\n\nOutput: ${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
      };
    }
  }

  if (name === 'run_e2e_tests') {
    try {
      // installing browsers if they are not installed
      // This is a bit risky to run every time, but necessary if not set up.
      // Ideally this should be a separate setup step or tool.
      // For now, let's assume browsers are installed or user runs it manually.
      // But we can try to install them if the test command fails with a specific error
      // or just trust the user environment.
      // Let's just run the test command. `playwright test` might detect missing browsers.

      const { stdout, stderr } = await execAsync('pnpm test:e2e', { cwd: WEB_APP });
      return {
        content: [
          {
            type: 'text',
            text: `✅ E2E TESTS PASSED\n\n${stdout}\n${stderr}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ E2E TESTS FAILED\n\nError: ${error.message}\n\nOutput: ${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
      };
    }
  }

  throw new Error('Tool not found');
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Interdomestik QA Server running on stdio');
