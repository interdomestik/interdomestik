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
    return {
      name,
      status: 'pass',
      output: `${stdout}${stderr ? `\n${stderr}` : ''}`.trim(),
    };
  } catch (error: any) {
    return {
      name,
      status: 'fail',
      output: `${error.stdout || ''}${error.stderr ? `\n${error.stderr}` : ''}`.trim(),
    };
  }
}

export async function runUnitTests() {
  try {
    const { stdout, stderr } = await execAsync('pnpm test:unit', { cwd: WEB_APP });
    return { content: [{ type: 'text', text: `✅ UNIT TESTS PASSED\n\n${stdout}\n${stderr}` }] };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ UNIT TESTS FAILED\n\nError: ${error.message}\n\nOutput: ${error.stdout || ''}\n${
            error.stderr || ''
          }`,
        },
      ],
    };
  }
}

export async function runE2ETests() {
  try {
    const { stdout, stderr } = await execAsync('pnpm test:e2e', { cwd: WEB_APP });
    return { content: [{ type: 'text', text: `✅ E2E TESTS PASSED\n\n${stdout}\n${stderr}` }] };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ E2E TESTS FAILED\n\nError: ${error.message}\n\nOutput: ${error.stdout || ''}\n${
            error.stderr || ''
          }`,
        },
      ],
    };
  }
}

export async function runCoverage() {
  try {
    const { stdout, stderr } = await execAsync('pnpm test:unit -- --coverage', { cwd: WEB_APP });
    return { content: [{ type: 'text', text: `✅ COVERAGE RUN PASSED\n\n${stdout}\n${stderr}` }] };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ COVERAGE RUN FAILED\n\nError: ${error.message}\n\nOutput: ${error.stdout || ''}\n${
            error.stderr || ''
          }`,
        },
      ],
    };
  }
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
  } else if (suite === 'full') {
    commands.push(
      { name: 'Unit Tests', command: 'pnpm test', cwd: REPO_ROOT },
      { name: 'E2E Tests', command: 'pnpm test:e2e', cwd: REPO_ROOT }
    );
  } else {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Unknown suite "${suite}". Use: unit | e2e | smoke | full.`,
        },
      ],
    };
  }

  for (const command of commands) {
    results.push(await runCommand(command.name, command.command, command.cwd));
  }

  const summary = formatSummary(results);
  const details = results
    .map(result => `\n\n${result.name} (${result.status.toUpperCase()}):\n${result.output || '(no output)'}`)
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
