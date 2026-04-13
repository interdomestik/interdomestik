import { spawn } from 'node:child_process';

export type FailureCategory =
  | 'build'
  | 'coverage'
  | 'db'
  | 'e2e'
  | 'i18n'
  | 'precheck'
  | 'release_gate'
  | 'security'
  | 'seed'
  | 'smoke'
  | 'unknown';

export type ExecOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
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

type StageDefinition = {
  marker: string;
  stage: string;
};

type FailurePattern = {
  commandPattern: RegExp;
  fallbackStage: string;
  stages: StageDefinition[];
};

type ExecErrorLike = Partial<ExecResult> & {
  code?: unknown;
  command?: string;
};

const FAILURE_PATTERNS: FailurePattern[] = [
  {
    commandPattern: /\bpnpm pr:verify:hosts\b/,
    fallbackStage: 'pr_verify_hosts',
    stages: [{ marker: 'pr-verify-hosts.sh', stage: 'pr_verify_hosts' }],
  },
  {
    commandPattern: /\bpnpm pr:verify\b/,
    fallbackStage: 'pr_verify',
    stages: [
      { marker: 'memory:precheck', stage: 'memory_precheck' },
      { marker: 'test:release-gate', stage: 'release_gate' },
      { marker: 'db:migrations:check-journal', stage: 'db_migrations_check_journal' },
      { marker: 'db:rls:test:required', stage: 'db_rls_test_required' },
      { marker: 'i18n:check', stage: 'i18n_check' },
      { marker: 'i18n:purity:check', stage: 'i18n_purity_check' },
      { marker: 'coverage:gate', stage: 'coverage_gate' },
      { marker: 'check:fast', stage: 'check_fast' },
      { marker: 'e2e:smoke', stage: 'e2e_smoke' },
    ],
  },
  {
    commandPattern: /\bpnpm check:fast\b/,
    fallbackStage: 'check_fast',
    stages: [
      { marker: 'build:ci', stage: 'build_ci' },
      { marker: 'e2e:state:setup', stage: 'e2e_state_setup' },
      { marker: 'e2e:gate:pr:fast', stage: 'e2e_gate_pr_fast' },
    ],
  },
  {
    commandPattern: /\bpnpm security:guard\b/,
    fallbackStage: 'security_guard',
    stages: [{ marker: 'security-guard.mjs', stage: 'security_guard' }],
  },
  {
    commandPattern: /\bpnpm e2e:gate\b/,
    fallbackStage: 'e2e_gate',
    stages: [
      { marker: '[Gatekeeper] Applying Schema', stage: 'db_migrate' },
      { marker: 'seed:e2e', stage: 'seed_e2e' },
      { marker: 'Building production-like standalone web artifact', stage: 'build_ci' },
      { marker: 'Running 61 tests using 1 worker', stage: 'e2e_gate' },
    ],
  },
  {
    commandPattern: /\bpnpm e2e:gate:pr:fast\b/,
    fallbackStage: 'e2e_gate_pr_fast',
    stages: [
      { marker: '[Gatekeeper] Applying Schema', stage: 'db_migrate' },
      { marker: 'seed:e2e', stage: 'seed_e2e' },
      { marker: 'Building production-like standalone web artifact', stage: 'build_ci' },
      { marker: 'Running 61 tests using 1 worker', stage: 'e2e_gate_pr_fast' },
    ],
  },
  {
    commandPattern: /\be2e:state:setup\b/,
    fallbackStage: 'e2e_state_setup',
    stages: [
      { marker: 'e2e/setup.state.spec.ts', stage: 'e2e_state_setup' },
      { marker: '[Setup] Generating state', stage: 'e2e_state_setup' },
    ],
  },
  {
    commandPattern: /\bbuild:ci\b/,
    fallbackStage: 'build_ci',
    stages: [
      { marker: 'Creating an optimized production build', stage: 'build_ci' },
      { marker: 'Running TypeScript', stage: 'build_ci' },
    ],
  },
];

const STAGE_CATEGORY_MAP: Record<string, FailureCategory> = {
  build_ci: 'build',
  check_fast: 'build',
  coverage_gate: 'coverage',
  db_migrate: 'db',
  db_migrations_check_journal: 'db',
  db_rls_test_required: 'db',
  e2e_gate: 'e2e',
  e2e_gate_pr_fast: 'e2e',
  e2e_state_setup: 'e2e',
  e2e_smoke: 'smoke',
  i18n_check: 'i18n',
  i18n_purity_check: 'i18n',
  memory_precheck: 'precheck',
  pr_verify: 'unknown',
  pr_verify_hosts: 'e2e',
  release_gate: 'release_gate',
  security_guard: 'security',
  seed_e2e: 'seed',
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

function normalizeFailureCategory(stage: string | null): FailureCategory | null {
  if (!stage) {
    return null;
  }

  return STAGE_CATEGORY_MAP[stage] ?? 'unknown';
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

export function classifyVerificationFailure(command: string, output: string) {
  const pattern = FAILURE_PATTERNS.find(candidate => candidate.commandPattern.test(command));

  if (!pattern) {
    return {
      failedStage: null,
      failureCategory: null,
    };
  }

  let failedStage = pattern.fallbackStage;
  let lastSeenIndex = -1;

  for (const stage of pattern.stages) {
    const stageIndex = output.lastIndexOf(stage.marker);
    if (stageIndex > lastSeenIndex) {
      lastSeenIndex = stageIndex;
      failedStage = stage.stage;
    }
  }

  return {
    failedStage,
    failureCategory: normalizeFailureCategory(failedStage),
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
      env: {
        ...process.env,
        ...env,
      },
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
