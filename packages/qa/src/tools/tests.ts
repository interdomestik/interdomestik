import { execAsync } from '../utils/exec.js';
import { REPO_ROOT, WEB_APP } from '../utils/paths.js';

type OrchestratorArgs = {
  suite?: string;
  useHyperExecute?: boolean;
};

type TestResult = {
  name: string;
  status: 'pass' | 'fail';
  output: string;
};

type ToolResponse = {
  content: Array<{
    type: 'text';
    text: string;
  }>;
};

function formatSummary(results: TestResult[]) {
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;

  const lines = results.map(result => {
    const icon = result.status === 'pass' ? '✅' : '❌';
    return `${icon} ${result.name}`;
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

async function runCommand(name: string, command: string, cwd: string): Promise<TestResult> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd });
    const errOutput = stderr ? `\n${stderr}` : '';
    return {
      name,
      status: 'pass',
      output: `${stdout}${errOutput}`.trim(),
    };
  } catch (error: any) {
    const errOutput = error.stderr ? `\n${error.stderr}` : '';
    return {
      name,
      status: 'fail',
      output: `${error.stdout || ''}${errOutput}`.trim(),
    };
  }
}

function formatToolResponse(prefix: string, stdout: string, stderr: string): ToolResponse {
  const sections = [prefix, '', stdout, stderr].filter(Boolean);
  return {
    content: [
      {
        type: 'text',
        text: sections.join('\n'),
      },
    ],
  };
}

function formatToolError(prefix: string, error: any): ToolResponse {
  const output = error.stdout || '';
  const errOutput = error.stderr || '';

  return {
    content: [
      {
        type: 'text',
        text: `${prefix}\n\nError: ${error.message}\n\nOutput: ${output}\n${errOutput}`,
      },
    ],
  };
}

async function runVerificationTool(command: string, successPrefix: string, failurePrefix: string) {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: REPO_ROOT });
    return formatToolResponse(successPrefix, stdout, stderr);
  } catch (error: any) {
    return formatToolError(failurePrefix, error);
  }
}

export async function runUnitTests() {
  try {
    const { stdout, stderr } = await execAsync('pnpm test:unit', { cwd: WEB_APP });
    return formatToolResponse('✅ UNIT TESTS PASSED', stdout, stderr);
  } catch (error: any) {
    return formatToolError('❌ UNIT TESTS FAILED', error);
  }
}

export async function runE2ETests() {
  try {
    const { stdout, stderr } = await execAsync('pnpm test:e2e', { cwd: WEB_APP });
    return formatToolResponse('✅ E2E TESTS PASSED', stdout, stderr);
  } catch (error: any) {
    return formatToolError('❌ E2E TESTS FAILED', error);
  }
}

export async function runCoverage() {
  try {
    const { stdout, stderr } = await execAsync('pnpm test:unit -- --coverage', { cwd: WEB_APP });
    return formatToolResponse('✅ COVERAGE RUN PASSED', stdout, stderr);
  } catch (error: any) {
    return formatToolError('❌ COVERAGE RUN FAILED', error);
  }
}

export async function runPrVerify() {
  return runVerificationTool('pnpm pr:verify', '✅ PR VERIFY PASSED', '❌ PR VERIFY FAILED');
}

export async function runSecurityGuard() {
  return runVerificationTool(
    'pnpm security:guard',
    '✅ SECURITY GUARD PASSED',
    '❌ SECURITY GUARD FAILED'
  );
}

export async function runE2EGate() {
  return runVerificationTool('pnpm e2e:gate', '✅ E2E GATE PASSED', '❌ E2E GATE FAILED');
}

export async function runTestsOrchestrator(args: OrchestratorArgs = {}) {
  const suite = (args.suite || 'full').toLowerCase();
  const results: TestResult[] = [];

  if (args.useHyperExecute) {
    results.push({
      name: 'HyperExecute',
      status: 'fail',
      output: 'HyperExecute is not configured for this repo. Running local tests instead.',
    });
  }

  const commands: Array<{ name: string; command: string; cwd: string }> = [];

  if (suite === 'unit') {
    commands.push({ name: 'Unit Tests', command: 'pnpm test', cwd: REPO_ROOT });
  } else if (suite === 'e2e') {
    commands.push({ name: 'E2E Tests', command: 'pnpm test:e2e', cwd: REPO_ROOT });
  } else if (suite === 'smoke') {
    commands.push({
      name: 'E2E Smoke Tests',
      command: 'pnpm --filter @interdomestik/web test:e2e -- --grep smoke',
      cwd: REPO_ROOT,
    });
  } else if (suite === 'pr_verify') {
    commands.push({ name: 'PR Verify', command: 'pnpm pr:verify', cwd: REPO_ROOT });
  } else if (suite === 'security_guard') {
    commands.push({ name: 'Security Guard', command: 'pnpm security:guard', cwd: REPO_ROOT });
  } else if (suite === 'e2e_gate') {
    commands.push({ name: 'E2E Gate', command: 'pnpm e2e:gate', cwd: REPO_ROOT });
  } else if (suite === 'full') {
    commands.push(
      { name: 'PR Verify', command: 'pnpm pr:verify', cwd: REPO_ROOT },
      { name: 'Security Guard', command: 'pnpm security:guard', cwd: REPO_ROOT },
      { name: 'E2E Gate', command: 'pnpm e2e:gate', cwd: REPO_ROOT }
    );
  } else {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Unknown suite "${suite}". Use: unit | e2e | smoke | pr_verify | security_guard | e2e_gate | full.`,
        },
      ],
    };
  }

  for (const command of commands) {
    results.push(await runCommand(command.name, command.command, command.cwd));
  }

  const summary = formatSummary(results);
  const details = results
    .map(
      result =>
        `\n\n${result.name} (${result.status.toUpperCase()}):\n${result.output || '(no output)'}`
    )
    .join('');

  return {
    content: [
      {
        type: 'text',
        text: `${summary}${details}`,
      },
    ],
  };
}
