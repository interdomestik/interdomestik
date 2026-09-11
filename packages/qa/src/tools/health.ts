import { coerceExecResult, execAsync, type ExecCommand } from '../utils/exec.js';
import { loadToolEnv } from '../utils/root-env.js';
import {
  resolveToolRepoRoot,
  type ToolRepoArgs,
  type ToolRepoContext,
} from '../utils/tool-repo-root.js';
import {
  buildCommandStructuredContent,
  buildHealthToolResult,
  type QACommandStructuredContent,
} from '../utils/tool-results.js';

type HealthCheckConfig = {
  command: ExecCommand;
  label: string;
  tool: string;
};

const HEALTH_CHECKS: HealthCheckConfig[] = [
  {
    command: { args: ['pr:verify'], display: 'pnpm pr:verify', file: 'pnpm' },
    label: 'PR Verify',
    tool: 'pr_verify',
  },
  {
    command: { args: ['security:guard'], display: 'pnpm security:guard', file: 'pnpm' },
    label: 'Security Guard',
    tool: 'security_guard',
  },
  // pr:verify above already executes the full E2E gate for this invocation.
];

function withRepoContext(
  result: ReturnType<typeof buildHealthToolResult>,
  context: ToolRepoContext
) {
  return { ...result, structuredContent: { ...result.structuredContent, ...context } };
}

export async function checkHealth(args: ToolRepoArgs) {
  const context = resolveToolRepoRoot(args);
  const env = loadToolEnv(context.repoRoot);
  const checks: QACommandStructuredContent[] = [];

  for (const check of HEALTH_CHECKS) {
    try {
      const result = await execAsync(check.command, { cwd: context.repoRoot, env });
      checks.push(buildCommandStructuredContent(check.tool, check.label, 'pass', result));
    } catch (error: any) {
      checks.push(
        buildCommandStructuredContent(
          check.tool,
          check.label,
          'fail',
          coerceExecResult(error, check.command, context.repoRoot)
        )
      );
    }
  }

  return withRepoContext(buildHealthToolResult(checks), context);
}
