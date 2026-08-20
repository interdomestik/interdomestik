import type { ExecCommand } from '../utils/exec.js';
import { REPO_ROOT, WEB_APP } from '../utils/paths.js';
import { loadToolEnv } from '../utils/root-env.js';
import {
  resolveToolRepoPath,
  resolveToolRepoRoot,
  type ToolRepoArgs,
  type ToolRepoContext,
} from '../utils/tool-repo-root.js';

type ToolCommandBase = {
  command: ExecCommand;
  cwd: string;
  label: string;
  tool: string;
};

export type ToolCommandConfig = ToolCommandBase & {
  context: ToolRepoContext;
  env: Partial<NodeJS.ProcessEnv>;
};

function pnpm(display: string, ...args: string[]): ExecCommand {
  return { args, display, file: 'pnpm' };
}

function node(display: string, ...args: string[]): ExecCommand {
  return { args, display, file: 'node' };
}

function config(tool: string, label: string, cwd: string, command: ExecCommand) {
  return { command, cwd, label, tool };
}

const CONFIGS = {
  build_ci: config(
    'build_ci',
    'Build CI',
    REPO_ROOT,
    node(
      'node scripts/run-with-default-db-url.mjs pnpm --filter @interdomestik/web run build:ci',
      'scripts/run-with-default-db-url.mjs',
      'pnpm',
      '--filter',
      '@interdomestik/web',
      'run',
      'build:ci'
    )
  ),
  check_fast: config('check_fast', 'Check Fast', REPO_ROOT, pnpm('pnpm check:fast', 'check:fast')),
  e2e_gate: config('e2e_gate', 'E2E Gate', REPO_ROOT, pnpm('pnpm e2e:gate', 'e2e:gate')),
  e2e_gate_pr_fast: config(
    'e2e_gate_pr_fast',
    'E2E Gate PR Fast',
    REPO_ROOT,
    node(
      'node scripts/run-with-default-db-url.mjs pnpm e2e:gate:pr:fast',
      'scripts/run-with-default-db-url.mjs',
      'pnpm',
      'e2e:gate:pr:fast'
    )
  ),
  e2e_state_setup: config(
    'e2e_state_setup',
    'E2E State Setup',
    REPO_ROOT,
    node(
      'node scripts/run-with-default-db-url.mjs pnpm e2e:state:setup',
      'scripts/run-with-default-db-url.mjs',
      'pnpm',
      'e2e:state:setup'
    )
  ),
  pr_verify: config('pr_verify', 'PR Verify', REPO_ROOT, pnpm('pnpm pr:verify', 'pr:verify')),
  pr_verify_hosts: config(
    'pr_verify_hosts',
    'PR Verify Hosts',
    REPO_ROOT,
    pnpm('pnpm pr:verify:hosts', 'pr:verify:hosts')
  ),
  run_coverage: config(
    'run_coverage',
    'Coverage',
    WEB_APP,
    pnpm('pnpm test:unit -- --coverage', 'test:unit', '--', '--coverage')
  ),
  run_e2e_tests: config('run_e2e_tests', 'E2E Tests', WEB_APP, pnpm('pnpm test:e2e', 'test:e2e')),
  run_unit_tests: config(
    'run_unit_tests',
    'Unit Tests',
    WEB_APP,
    pnpm('pnpm test:unit', 'test:unit')
  ),
  security_guard: config(
    'security_guard',
    'Security Guard',
    REPO_ROOT,
    pnpm('pnpm security:guard', 'security:guard')
  ),
  smoke: config(
    'smoke',
    'E2E Smoke Tests',
    REPO_ROOT,
    pnpm(
      'pnpm --filter @interdomestik/web test:e2e -- --grep smoke',
      '--filter',
      '@interdomestik/web',
      'test:e2e',
      '--',
      '--grep',
      'smoke'
    )
  ),
} satisfies Record<string, ToolCommandBase>;

type ToolConfigName = keyof typeof CONFIGS;

const SUITES: Record<string, ToolConfigName[]> = {
  build_ci: ['build_ci'],
  check_fast: ['check_fast'],
  e2e: ['run_e2e_tests'],
  e2e_gate: ['e2e_gate'],
  e2e_gate_pr_fast: ['e2e_gate_pr_fast'],
  e2e_state_setup: ['e2e_state_setup'],
  full: ['pr_verify', 'security_guard', 'e2e_gate'],
  pr_verify: ['pr_verify'],
  pr_verify_hosts: ['pr_verify_hosts'],
  security_guard: ['security_guard'],
  smoke: ['smoke'],
  unit: ['run_unit_tests'],
};

export function getBoundToolConfig(tool: string, args: ToolRepoArgs): ToolCommandConfig {
  const selected = CONFIGS[tool as ToolConfigName];
  if (!selected) throw new Error(`Unknown tool config: ${tool}`);
  const context = resolveToolRepoRoot(args);
  const { repoRoot } = context;
  const cwd =
    selected.cwd === WEB_APP ? resolveToolRepoPath(repoRoot, 'apps/web').resolvedPath : repoRoot;
  return { ...selected, context, cwd, env: loadToolEnv(repoRoot) };
}

export function getBoundOrchestratorConfigs(suite: string, args: ToolRepoArgs) {
  return SUITES[suite]?.map(tool => getBoundToolConfig(tool, args)) ?? null;
}
