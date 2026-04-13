import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { coerceExecResult, execAsync, type ExecCommand, type ExecResult } from '../utils/exec.js';
import { REPO_ROOT, WEB_APP } from '../utils/paths.js';
import { buildCommandToolResult } from '../utils/tool-results.js';

type OrchestratorArgs = {
  suite?: string;
  useHyperExecute?: boolean;
};

type ToolCommandConfig = {
  command: ExecCommand;
  cwd: string;
  label: string;
  tool: string;
};

type TestResult = {
  durationMs: number;
  failedStage: string | null;
  name: string;
  output: string;
  status: 'pass' | 'fail';
};

function createPnpmCommand(display: string, ...args: string[]): ExecCommand {
  return { args, display, file: 'pnpm' };
}

function createNodeCommand(display: string, ...args: string[]): ExecCommand {
  return { args, display, file: 'node' };
}

function createToolConfig(
  tool: string,
  label: string,
  cwd: string,
  command: ExecCommand
): ToolCommandConfig {
  return { command, cwd, label, tool };
}

const TOOL_CONFIGS = {
  build_ci: createToolConfig(
    'build_ci',
    'Build CI',
    REPO_ROOT,
    createNodeCommand(
      'node scripts/run-with-default-db-url.mjs pnpm --filter @interdomestik/web run build:ci',
      'scripts/run-with-default-db-url.mjs',
      'pnpm',
      '--filter',
      '@interdomestik/web',
      'run',
      'build:ci'
    )
  ),
  check_fast: createToolConfig(
    'check_fast',
    'Check Fast',
    REPO_ROOT,
    createPnpmCommand('pnpm check:fast', 'check:fast')
  ),
  e2e_gate: createToolConfig(
    'e2e_gate',
    'E2E Gate',
    REPO_ROOT,
    createPnpmCommand('pnpm e2e:gate', 'e2e:gate')
  ),
  e2e_gate_pr_fast: createToolConfig(
    'e2e_gate_pr_fast',
    'E2E Gate PR Fast',
    REPO_ROOT,
    createNodeCommand(
      'node scripts/run-with-default-db-url.mjs pnpm e2e:gate:pr:fast',
      'scripts/run-with-default-db-url.mjs',
      'pnpm',
      'e2e:gate:pr:fast'
    )
  ),
  e2e_state_setup: createToolConfig(
    'e2e_state_setup',
    'E2E State Setup',
    REPO_ROOT,
    createNodeCommand(
      'node scripts/run-with-default-db-url.mjs pnpm e2e:state:setup',
      'scripts/run-with-default-db-url.mjs',
      'pnpm',
      'e2e:state:setup'
    )
  ),
  pr_verify: createToolConfig(
    'pr_verify',
    'PR Verify',
    REPO_ROOT,
    createPnpmCommand('pnpm pr:verify', 'pr:verify')
  ),
  pr_verify_hosts: createToolConfig(
    'pr_verify_hosts',
    'PR Verify Hosts',
    REPO_ROOT,
    createPnpmCommand('pnpm pr:verify:hosts', 'pr:verify:hosts')
  ),
  run_coverage: createToolConfig(
    'run_coverage',
    'Coverage',
    WEB_APP,
    createPnpmCommand('pnpm test:unit -- --coverage', 'test:unit', '--', '--coverage')
  ),
  run_e2e_tests: createToolConfig(
    'run_e2e_tests',
    'E2E Tests',
    WEB_APP,
    createPnpmCommand('pnpm test:e2e', 'test:e2e')
  ),
  run_unit_tests: createToolConfig(
    'run_unit_tests',
    'Unit Tests',
    WEB_APP,
    createPnpmCommand('pnpm test:unit', 'test:unit')
  ),
  security_guard: createToolConfig(
    'security_guard',
    'Security Guard',
    REPO_ROOT,
    createPnpmCommand('pnpm security:guard', 'security:guard')
  ),
  smoke: createToolConfig(
    'smoke',
    'E2E Smoke Tests',
    REPO_ROOT,
    createPnpmCommand(
      'pnpm --filter @interdomestik/web test:e2e -- --grep smoke',
      '--filter',
      '@interdomestik/web',
      'test:e2e',
      '--',
      '--grep',
      'smoke'
    )
  ),
} satisfies Record<string, ToolCommandConfig>;

type ToolConfigName = keyof typeof TOOL_CONFIGS;

const SUITE_TO_TOOL_CONFIGS: Record<string, ToolConfigName[]> = {
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

function formatSummary(results: TestResult[]) {
  const passed = results.filter(result => result.status === 'pass').length;
  const failed = results.filter(result => result.status === 'fail').length;

  const lines = results.map(result => {
    const icon = result.status === 'pass' ? '✅' : '❌';
    const stageSuffix = result.failedStage ? ` [${result.failedStage}]` : '';
    return `${icon} ${result.name}${stageSuffix} (${result.durationMs}ms)`;
  });

  return [
    'TESTS ORCHESTRATOR SUMMARY',
    '',
    ...lines,
    '',
    `Passed: ${passed}`,
    `Failed: ${failed}`,
  ].join('\n');
}

function toTestResult(name: string, result: ExecResult, status: 'pass' | 'fail'): TestResult {
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

  return {
    durationMs: result.durationMs,
    failedStage: result.failedStage,
    name,
    output: output || '(no output)',
    status,
  };
}

async function executeToolCommand(config: ToolCommandConfig): Promise<CallToolResult> {
  try {
    const result = await execAsync(config.command, { cwd: config.cwd });
    return buildCommandToolResult(config.tool, config.label, 'pass', result);
  } catch (error: any) {
    return buildCommandToolResult(
      config.tool,
      config.label,
      'fail',
      coerceExecResult(error, config.command, config.cwd)
    );
  }
}

async function runCommand(config: ToolCommandConfig): Promise<TestResult> {
  try {
    const result = await execAsync(config.command, { cwd: config.cwd });
    return toTestResult(config.label, result, 'pass');
  } catch (error: any) {
    return toTestResult(config.label, coerceExecResult(error, config.command, config.cwd), 'fail');
  }
}

function getToolConfig(tool: string): ToolCommandConfig {
  const config = TOOL_CONFIGS[tool as ToolConfigName];

  if (!config) {
    throw new Error(`Unknown tool config: ${tool}`);
  }

  return config;
}

function getOrchestratorConfigs(suite: string): ToolCommandConfig[] | null {
  const toolNames = SUITE_TO_TOOL_CONFIGS[suite];
  return toolNames ? toolNames.map(tool => getToolConfig(tool)) : null;
}

export async function runUnitTests() {
  return executeToolCommand(getToolConfig('run_unit_tests'));
}

export async function runE2ETests() {
  return executeToolCommand(getToolConfig('run_e2e_tests'));
}

export async function runCoverage() {
  return executeToolCommand(getToolConfig('run_coverage'));
}

export async function runPrVerify() {
  return executeToolCommand(getToolConfig('pr_verify'));
}

export async function runSecurityGuard() {
  return executeToolCommand(getToolConfig('security_guard'));
}

export async function runE2EGate() {
  return executeToolCommand(getToolConfig('e2e_gate'));
}

export async function runBuildCi() {
  return executeToolCommand(getToolConfig('build_ci'));
}

export async function runCheckFast() {
  return executeToolCommand(getToolConfig('check_fast'));
}

export async function runE2EStateSetup() {
  return executeToolCommand(getToolConfig('e2e_state_setup'));
}

export async function runE2EGatePrFast() {
  return executeToolCommand(getToolConfig('e2e_gate_pr_fast'));
}

export async function runPrVerifyHosts() {
  return executeToolCommand(getToolConfig('pr_verify_hosts'));
}

export async function runTestsOrchestrator(args: OrchestratorArgs = {}) {
  const suite = (args.suite || 'full').toLowerCase();
  const results: TestResult[] = [];

  if (args.useHyperExecute) {
    results.push({
      durationMs: 0,
      failedStage: null,
      name: 'HyperExecute',
      output: 'HyperExecute is not configured for this repo. Running local tests instead.',
      status: 'fail',
    });
  }

  const commands = getOrchestratorConfigs(suite);

  if (!commands) {
    return {
      content: [
        {
          type: 'text',
          text:
            `❌ Unknown suite "${suite}". Use: unit | e2e | smoke | pr_verify | security_guard | ` +
            'e2e_gate | build_ci | check_fast | e2e_state_setup | e2e_gate_pr_fast | ' +
            'pr_verify_hosts | full.',
        },
      ],
      isError: true,
      structuredContent: {
        failedStage: null,
        status: 'fail',
        suite,
        tool: 'tests_orchestrator',
      },
    } satisfies CallToolResult;
  }

  for (const command of commands) {
    results.push(await runCommand(command));
  }

  const summary = formatSummary(results);
  const details = results
    .map(result => `\n\n${result.name} (${result.status.toUpperCase()}):\n${result.output}`)
    .join('');

  return {
    content: [
      {
        type: 'text',
        text: `${summary}${details}`,
      },
    ],
    isError: results.some(result => result.status === 'fail'),
    structuredContent: {
      failedStages: results
        .filter(result => result.status === 'fail' && result.failedStage)
        .map(result => result.failedStage),
      results: results.map(result => ({
        durationMs: result.durationMs,
        failedStage: result.failedStage,
        name: result.name,
        status: result.status,
      })),
      status: results.some(result => result.status === 'fail') ? 'fail' : 'pass',
      suite,
      tool: 'tests_orchestrator',
    },
  } satisfies CallToolResult;
}
