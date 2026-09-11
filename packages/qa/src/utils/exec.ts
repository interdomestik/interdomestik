import { spawn } from 'node:child_process';
import { buildToolProcessEnv } from './root-env.js';

import { classifyVerificationFailure, type FailureCategory } from './verification-failure.js';
export { classifyVerificationFailure, type FailureCategory } from './verification-failure.js';

export type ExecOptions = {
  cwd: string;
  env?: Partial<NodeJS.ProcessEnv>;
  maxOutputBytes?: number;
  timeoutMs?: number;
};

export type ExecCommand = {
  args?: string[];
  display?: string;
  file: string;
};

export type ExecResult = {
  command: string;
  cwd: string;
  durationMs: number;
  exitCode: number | null;
  failedStage: string | null;
  failureCategory: FailureCategory | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stderrTruncated: boolean;
  stdout: string;
  stdoutTruncated: boolean;
  timedOut: boolean;
};

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 0;

type OutputBufferState = {
  text: string;
  truncated: boolean;
};

type ExecErrorLike = Partial<ExecResult> & {
  code?: unknown;
  command?: string;
};

function trimToLastBytes(text: string, maxOutputBytes: number) {
  const textBuffer = Buffer.from(text);

  if (textBuffer.length <= maxOutputBytes) {
    return text;
  }

  return textBuffer.subarray(textBuffer.length - maxOutputBytes).toString('utf8');
}

function appendOutput(
  current: OutputBufferState,
  chunk: string,
  maxOutputBytes: number
): OutputBufferState {
  const combined = current.text + chunk;
  const truncated = current.truncated || Buffer.byteLength(combined) > maxOutputBytes;

  return {
    text: truncated ? trimToLastBytes(combined, maxOutputBytes) : combined,
    truncated,
  };
}

function formatCommandPart(part: string) {
  return /\s|["'`$\\]/.test(part) ? JSON.stringify(part) : part;
}

export function formatExecCommand(command: ExecCommand) {
  if (command.display) {
    return command.display;
  }

  return [command.file, ...(command.args ?? [])].map(formatCommandPart).join(' ');
}

export function coerceExitCode(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return null;
    }

    const parsedValue = Number(trimmedValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

export function coerceExecResult(
  error: unknown,
  fallbackCommand: ExecCommand,
  fallbackCwd: string
): ExecResult {
  const execError = (error ?? {}) as ExecErrorLike;

  return {
    command: execError.command ?? formatExecCommand(fallbackCommand),
    cwd: execError.cwd ?? fallbackCwd,
    durationMs: execError.durationMs ?? 0,
    exitCode: coerceExitCode(execError.exitCode ?? execError.code),
    failedStage: execError.failedStage ?? null,
    failureCategory: execError.failureCategory ?? null,
    signal: execError.signal ?? null,
    stderr: (execError.stderr || '').trim(),
    stderrTruncated: execError.stderrTruncated ?? false,
    stdout: (execError.stdout || '').trim(),
    stdoutTruncated: execError.stdoutTruncated ?? false,
    timedOut: execError.timedOut ?? false,
  };
}

export async function execAsync(command: ExecCommand, options: ExecOptions): Promise<ExecResult> {
  const {
    cwd,
    env,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const startedAt = Date.now();
  const commandDisplay = formatExecCommand(command);

  return new Promise((resolve, reject) => {
    const child = spawn(command.file, command.args ?? [], {
      cwd,
      env: buildToolProcessEnv(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutState: OutputBufferState = { text: '', truncated: false };
    let stderrState: OutputBufferState = { text: '', truncated: false };
    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let killHandle: NodeJS.Timeout | undefined;
    let settled = false;

    const clearHandles = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (killHandle) clearTimeout(killHandle);
    };

    const buildResult = (exitCode: number | null, signal: NodeJS.Signals | null): ExecResult => ({
      command: commandDisplay,
      cwd,
      durationMs: Date.now() - startedAt,
      exitCode,
      failedStage: null,
      failureCategory: null,
      signal,
      stderr: stderrState.text.trim(),
      stderrTruncated: stderrState.truncated,
      stdout: stdoutState.text.trim(),
      stdoutTruncated: stdoutState.truncated,
      timedOut,
    });

    const rejectWithResult = (result: ExecResult, error?: Error) => {
      const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
      const classification = classifyVerificationFailure(commandDisplay, combinedOutput);
      const baseError =
        error ??
        new Error(
          `Command failed with exit code ${result.exitCode ?? 'null'}${timedOut ? ' (timeout)' : ''}`
        );

      reject(
        Object.assign(baseError, {
          ...result,
          ...classification,
        })
      );
    };

    child.stdout.on('data', chunk => {
      stdoutState = appendOutput(stdoutState, chunk.toString(), maxOutputBytes);
    });

    child.stderr.on('data', chunk => {
      stderrState = appendOutput(stderrState, chunk.toString(), maxOutputBytes);
    });

    child.on('error', error => {
      if (settled) {
        return;
      }

      settled = true;
      clearHandles();
      rejectWithResult(buildResult(null, null), error);
    });

    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        killHandle = setTimeout(() => child.kill('SIGKILL'), 5000);
      }, timeoutMs);
    }

    child.on('close', (exitCode, signal) => {
      if (settled) {
        return;
      }

      settled = true;
      clearHandles();
      const result = buildResult(exitCode, signal);
      if (exitCode === 0 && !timedOut) {
        resolve(result);
        return;
      }

      rejectWithResult(result);
    });
  });
}
