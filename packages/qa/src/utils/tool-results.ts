import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ExecResult, FailureCategory } from './exec.js';

type CommandStatus = 'pass' | 'fail';

export type QACommandStructuredContent = {
  command: string;
  cwd: string;
  durationMs: number;
  exitCode: number | null;
  failedStage: string | null;
  failureCategory: FailureCategory | null;
  label: string;
  signal: NodeJS.Signals | null;
  status: CommandStatus;
  stderrTail: string;
  stderrTruncated: boolean;
  stdoutTail: string;
  stdoutTruncated: boolean;
  timedOut: boolean;
  tool: string;
};

export type QAHealthStructuredContent = {
  checks: QACommandStructuredContent[];
  durationMs: number;
  failedChecks: string[];
  status: CommandStatus;
  tool: 'check_health';
};

function clipText(text: string, maxChars = 4000) {
  if (text.length <= maxChars) {
    return text;
  }

  return text.slice(text.length - maxChars);
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function buildTextBlock(title: string, value: string) {
  if (!value) {
    return null;
  }

  return `${title}:\n${clipText(value)}`;
}

export function buildCommandStructuredContent(
  tool: string,
  label: string,
  status: CommandStatus,
  result: ExecResult
): QACommandStructuredContent {
  return {
    command: result.command,
    cwd: result.cwd,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    failedStage: result.failedStage,
    failureCategory: result.failureCategory,
    label,
    signal: result.signal,
    status,
    stderrTail: result.stderr,
    stderrTruncated: result.stderrTruncated,
    stdoutTail: result.stdout,
    stdoutTruncated: result.stdoutTruncated,
    timedOut: result.timedOut,
    tool,
  };
}

export function buildCommandToolResult(
  tool: string,
  label: string,
  status: CommandStatus,
  result: ExecResult
): CallToolResult {
  const structuredContent = buildCommandStructuredContent(tool, label, status, result);
  const headline =
    status === 'pass' ? `✅ ${label.toUpperCase()} PASSED` : `❌ ${label.toUpperCase()} FAILED`;
  const details = [
    `Command: ${structuredContent.command}`,
    `Duration: ${formatDuration(structuredContent.durationMs)}`,
    `Cwd: ${structuredContent.cwd}`,
    `Exit code: ${structuredContent.exitCode ?? 'null'}`,
    structuredContent.failedStage ? `Failed stage: ${structuredContent.failedStage}` : null,
    structuredContent.failureCategory
      ? `Failure category: ${structuredContent.failureCategory}`
      : null,
    structuredContent.timedOut ? 'Timed out: yes' : null,
    structuredContent.stdoutTruncated ? 'Stdout truncated: yes' : null,
    structuredContent.stderrTruncated ? 'Stderr truncated: yes' : null,
  ].filter(Boolean);

  const blocks = [
    headline,
    '',
    ...details,
    buildTextBlock('STDOUT (tail)', structuredContent.stdoutTail),
    buildTextBlock('STDERR (tail)', structuredContent.stderrTail),
  ].filter(Boolean);

  return {
    content: [
      {
        type: 'text',
        text: blocks.join('\n\n'),
      },
    ],
    isError: status === 'fail',
    structuredContent,
  };
}

export function buildHealthToolResult(checks: QACommandStructuredContent[]): CallToolResult {
  const durationMs = checks.reduce((sum, check) => sum + check.durationMs, 0);
  const failedChecks = checks.filter(check => check.status === 'fail').map(check => check.tool);
  const status: CommandStatus = failedChecks.length === 0 ? 'pass' : 'fail';

  const structuredContent: QAHealthStructuredContent = {
    checks,
    durationMs,
    failedChecks,
    status,
    tool: 'check_health',
  };

  const summaryLines = checks.map(check => {
    const icon = check.status === 'pass' ? '✅' : '❌';
    const suffix = check.failedStage ? ` (${check.failedStage})` : '';
    return `${icon} ${check.label} [${formatDuration(check.durationMs)}]${suffix}`;
  });

  return {
    content: [
      {
        type: 'text',
        text: [
          status === 'pass' ? '✅ HEALTH CHECK PASSED' : '❌ HEALTH CHECK FAILED',
          '',
          ...summaryLines,
          '',
          `Failed checks: ${failedChecks.length}`,
        ].join('\n'),
      },
    ],
    isError: status === 'fail',
    structuredContent,
  };
}
