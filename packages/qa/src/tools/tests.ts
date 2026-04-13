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
  const configs: Record<string, ToolCommandConfig> = {
    build_ci: {
      command: {
        args: [
          'scripts/run-with-default-db-url.mjs',
          'pnpm',
          '--filter',
          '@interdomestik/web',
          'run',
          'build:ci',
        ],
        display:
          'node scripts/run-with-default-db-url.mjs pnpm --filter @interdomestik/web run build:ci',
        file: 'node',
      },
      cwd: REPO_ROOT,
      label: 'Build CI',
      tool: 'build_ci',
    },
    check_fast: {
      command: { args: ['check:fast'], display: 'pnpm check:fast', file: 'pnpm' },
      cwd: REPO_ROOT,
      label: 'Check Fast',
      tool: 'check_fast',
    },
    e2e_gate: {
      command: { args: ['e2e:gate'], display: 'pnpm e2e:gate', file: 'pnpm' },
      cwd: REPO_ROOT,
      label: 'E2E Gate',
      tool: 'e2e_gate',
    },
    e2e_gate_pr_fast: {
      command: {
        args: ['scripts/run-with-default-db-url.mjs', 'pnpm', 'e2e:gate:pr:fast'],
        display: 'node scripts/run-with-default-db-url.mjs pnpm e2e:gate:pr:fast',
        file: 'node',
      },
      cwd: REPO_ROOT,
      label: 'E2E Gate PR Fast',
      tool: 'e2e_gate_pr_fast',
    },
    e2e_state_setup: {
      command: {
        args: ['scripts/run-with-default-db-url.mjs', 'pnpm', 'e2e:state:setup'],
        display: 'node scripts/run-with-default-db-url.mjs pnpm e2e:state:setup',
        file: 'node',
      },
      cwd: REPO_ROOT,
      label: 'E2E State Setup',
      tool: 'e2e_state_setup',
    },
    pr_verify: {
      command: { args: ['pr:verify'], display: 'pnpm pr:verify', file: 'pnpm' },
      cwd: REPO_ROOT,
      label: 'PR Verify',
      tool: 'pr_verify',
    },
    pr_verify_hosts: {
      command: { args: ['pr:verify:hosts'], display: 'pnpm pr:verify:hosts', file: 'pnpm' },
      cwd: REPO_ROOT,
      label: 'PR Verify Hosts',
      tool: 'pr_verify_hosts',
    },
    run_coverage: {
      command: {
        args: ['test:unit', '--', '--coverage'],
        display: 'pnpm test:unit -- --coverage',
        file: 'pnpm',
      },
      cwd: WEB_APP,
      label: 'Coverage',
      tool: 'run_coverage',
    },
    run_e2e_tests: {
      command: { args: ['test:e2e'], display: 'pnpm test:e2e', file: 'pnpm' },
      cwd: WEB_APP,
      label: 'E2E Tests',
      tool: 'run_e2e_tests',
    },
    run_unit_tests: {
      command: { args: ['test:unit'], display: 'pnpm test:unit', file: 'pnpm' },
      cwd: WEB_APP,
      label: 'Unit Tests',
      tool: 'run_unit_tests',
    },
    security_guard: {
      command: { args: ['security:guard'], display: 'pnpm security:guard', file: 'pnpm' },
      cwd: REPO_ROOT,
      label: 'Security Guard',
      tool: 'security_guard',
    },
  };

  const config = configs[tool];

  if (!config) {
    throw new Error(`Unknown tool config: ${tool}`);
  }

  return config;
}

function getOrchestratorConfigs(suite: string): ToolCommandConfig[] | null {
  if (suite === 'unit') {
    return [getToolConfig('run_unit_tests')];
  }
  if (suite === 'e2e') {
    return [getToolConfig('run_e2e_tests')];
  }
  if (suite === 'smoke') {
    return [
      {
        command: {
          args: ['--filter', '@interdomestik/web', 'test:e2e', '--', '--grep', 'smoke'],
          display: 'pnpm --filter @interdomestik/web test:e2e -- --grep smoke',
          file: 'pnpm',
        },
        cwd: REPO_ROOT,
        label: 'E2E Smoke Tests',
        tool: 'smoke',
      },
    ];
  }
  if (suite === 'pr_verify') {
    return [getToolConfig('pr_verify')];
  }
  if (suite === 'security_guard') {
    return [getToolConfig('security_guard')];
  }
  if (suite === 'e2e_gate') {
    return [getToolConfig('e2e_gate')];
  }
  if (suite === 'build_ci') {
    return [getToolConfig('build_ci')];
  }
  if (suite === 'check_fast') {
    return [getToolConfig('check_fast')];
  }
  if (suite === 'e2e_state_setup') {
    return [getToolConfig('e2e_state_setup')];
  }
  if (suite === 'e2e_gate_pr_fast') {
    return [getToolConfig('e2e_gate_pr_fast')];
  }
  if (suite === 'pr_verify_hosts') {
    return [getToolConfig('pr_verify_hosts')];
  }
  if (suite === 'full') {
    return [getToolConfig('pr_verify'), getToolConfig('security_guard'), getToolConfig('e2e_gate')];
  }

  return null;
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
