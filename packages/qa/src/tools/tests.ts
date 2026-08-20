import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { coerceExecResult, execAsync, type ExecResult } from '../utils/exec.js';
import { resolveToolRepoRoot, type ToolRepoArgs } from '../utils/tool-repo-root.js';
import { buildCommandToolResult } from '../utils/tool-results.js';
import {
  getBoundOrchestratorConfigs,
  getBoundToolConfig,
  type ToolCommandConfig,
} from './test-configs.js';

type OrchestratorArgs = ToolRepoArgs & {
  suite?: string;
  useHyperExecute?: boolean;
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
    const result = await execAsync(config.command, { cwd: config.cwd, env: config.env });
    return buildCommandToolResult(config.tool, config.label, 'pass', result, config.context);
  } catch (error: any) {
    return buildCommandToolResult(
      config.tool,
      config.label,
      'fail',
      coerceExecResult(error, config.command, config.cwd),
      config.context
    );
  }
}

async function runCommand(config: ToolCommandConfig): Promise<TestResult> {
  try {
    const result = await execAsync(config.command, { cwd: config.cwd, env: config.env });
    return toTestResult(config.label, result, 'pass');
  } catch (error: any) {
    return toTestResult(config.label, coerceExecResult(error, config.command, config.cwd), 'fail');
  }
}

export async function runUnitTests(args: ToolRepoArgs) {
  return executeToolCommand(getBoundToolConfig('run_unit_tests', args));
}

export async function runE2ETests(args: ToolRepoArgs) {
  return executeToolCommand(getBoundToolConfig('run_e2e_tests', args));
}

export async function runCoverage(args: ToolRepoArgs) {
  return executeToolCommand(getBoundToolConfig('run_coverage', args));
}

export async function runPrVerify(args: ToolRepoArgs) {
  return executeToolCommand(getBoundToolConfig('pr_verify', args));
}

export async function runSecurityGuard(args: ToolRepoArgs) {
  return executeToolCommand(getBoundToolConfig('security_guard', args));
}

export async function runE2EGate(args: ToolRepoArgs) {
  return executeToolCommand(getBoundToolConfig('e2e_gate', args));
}

export async function runBuildCi(args: ToolRepoArgs) {
  return executeToolCommand(getBoundToolConfig('build_ci', args));
}

export async function runCheckFast(args: ToolRepoArgs) {
  return executeToolCommand(getBoundToolConfig('check_fast', args));
}

export async function runE2EStateSetup(args: ToolRepoArgs) {
  return executeToolCommand(getBoundToolConfig('e2e_state_setup', args));
}

export async function runE2EGatePrFast(args: ToolRepoArgs) {
  return executeToolCommand(getBoundToolConfig('e2e_gate_pr_fast', args));
}

export async function runPrVerifyHosts(args: ToolRepoArgs) {
  return executeToolCommand(getBoundToolConfig('pr_verify_hosts', args));
}

export async function runTestsOrchestrator(args: OrchestratorArgs = {}) {
  const context = resolveToolRepoRoot(args);
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

  const commands = getBoundOrchestratorConfigs(suite, args);

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
        ...context,
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
      ...context,
    },
  } satisfies CallToolResult;
}
