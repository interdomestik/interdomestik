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

export async function execAsync(command: string, options: ExecOptions): Promise<ExecResult> {
  const {
    cwd,
    env,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutState: OutputBufferState = { text: '', truncated: false };
    let stderrState: OutputBufferState = { text: '', truncated: false };
    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let killHandle: NodeJS.Timeout | undefined;

    child.stdout.on('data', chunk => {
      stdoutState = appendOutput(stdoutState, chunk.toString(), maxOutputBytes);
    });

    child.stderr.on('data', chunk => {
      stderrState = appendOutput(stderrState, chunk.toString(), maxOutputBytes);
    });

    child.on('error', error => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (killHandle) clearTimeout(killHandle);
      reject(error);
    });

    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        killHandle = setTimeout(() => child.kill('SIGKILL'), 5000);
      }, timeoutMs);
    }

    child.on('close', (exitCode, signal) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (killHandle) clearTimeout(killHandle);

      const result: ExecResult = {
        command,
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
      };

      if (exitCode === 0 && !timedOut) {
        resolve(result);
        return;
      }

      const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
      const classification = classifyVerificationFailure(command, combinedOutput);
      const failure = Object.assign(
        new Error(
          `Command failed with exit code ${exitCode ?? 'null'}${timedOut ? ' (timeout)' : ''}`
        ),
        result,
        classification
      );

      reject(failure);
    });
  });
}
