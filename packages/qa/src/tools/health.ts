import { coerceExecResult, execAsync, type ExecCommand } from '../utils/exec.js';
import { REPO_ROOT } from '../utils/paths.js';
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
  {
    command: { args: ['e2e:gate'], display: 'pnpm e2e:gate', file: 'pnpm' },
    label: 'E2E Gate',
    tool: 'e2e_gate',
  },
];

export async function checkHealth() {
  const checks: QACommandStructuredContent[] = [];

  for (const check of HEALTH_CHECKS) {
    try {
      const result = await execAsync(check.command, { cwd: REPO_ROOT });
      checks.push(buildCommandStructuredContent(check.tool, check.label, 'pass', result));
    } catch (error: any) {
      checks.push(
        buildCommandStructuredContent(
          check.tool,
          check.label,
          'fail',
          coerceExecResult(error, check.command, REPO_ROOT)
        )
      );
    }
  }

  return buildHealthToolResult(checks);
}
