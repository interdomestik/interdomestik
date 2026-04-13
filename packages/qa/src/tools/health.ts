import { execAsync, type ExecResult } from '../utils/exec.js';
import { REPO_ROOT } from '../utils/paths.js';
import { buildCommandStructuredContent, buildHealthToolResult } from '../utils/tool-results.js';

type HealthCheckConfig = {
  command: string;
  label: string;
  tool: string;
};

const HEALTH_CHECKS: HealthCheckConfig[] = [
  {
    command: 'pnpm pr:verify',
    label: 'PR Verify',
    tool: 'pr_verify',
  },
  {
    command: 'pnpm security:guard',
    label: 'Security Guard',
    tool: 'security_guard',
  },
  {
    command: 'pnpm e2e:gate',
    label: 'E2E Gate',
    tool: 'e2e_gate',
  },
];

function coerceExecResult(error: any, fallbackCommand: string): ExecResult {
  return {
    command: error?.command ?? fallbackCommand,
    cwd: error?.cwd ?? REPO_ROOT,
    durationMs: error?.durationMs ?? 0,
    exitCode: error?.exitCode ?? error?.code ?? null,
    failedStage: error?.failedStage ?? null,
    failureCategory: error?.failureCategory ?? null,
    signal: error?.signal ?? null,
    stderr: (error?.stderr || '').trim(),
    stderrTruncated: error?.stderrTruncated ?? false,
    stdout: (error?.stdout || '').trim(),
    stdoutTruncated: error?.stdoutTruncated ?? false,
    timedOut: error?.timedOut ?? false,
  };
}

export async function checkHealth() {
  const checks = [];

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
          coerceExecResult(error, check.command)
        )
      );
    }
  }

  return buildHealthToolResult(checks);
}
