import 'server-only';

/**
 * Temporary, disabled-by-default login entry phase timing. It activates only on a Vercel Preview
 * deployment whose commit equals the targeted commit, inside an owner-issued window of at most one
 * hour, and then emits one fixed-schema JSON line per entry. It never reads request, identity,
 * tenant or error data, and nothing it does can replace the page result or an original error.
 * session_ms is caller wait, potentially shared, not DB/import time. tenant_context_ms includes
 * existing headers/neutral-host resolution. entry_returned is node construction, not body/hydration.
 */

export type LoginEntryTimingPhase = 'session' | 'tenant_context' | 'translations';
export type LoginEntryTimingMark = 'redirect_requested' | 'entry_returned';

export type LoginEntryTiming = {
  /** Starts a phase; the returned function finishes it synchronously, at most once. */
  readonly begin: (phase: LoginEntryTimingPhase) => () => void;
  readonly sessionResolved: (found: boolean) => void;
  readonly mark: (name: LoginEntryTimingMark) => void;
  /** Seals the recorder before logging once; later calls on this recorder are ignored. */
  readonly finishOnce: () => void;
};

export type LoginEntryTimingEnv = {
  readonly [key: string]: string | undefined;
  readonly VERCEL_ENV?: string | undefined;
  readonly COMMIT_SHA?: string | undefined;
  readonly LOGIN_ENTRY_TIMING_TARGET_SHA?: string | undefined;
  readonly LOGIN_ENTRY_TIMING_ISSUED_AT?: string | undefined;
  readonly LOGIN_ENTRY_TIMING_EXPIRES_AT?: string | undefined;
};

export type LoginEntryTimingDeps = {
  readonly env?: LoginEntryTimingEnv;
  /** Monotonic milliseconds, used only for durations. */
  readonly now?: () => number;
  /** Epoch milliseconds, used only for the activation window. */
  readonly epochNow?: () => number;
  readonly log?: (line: string) => void;
};

type DurationKey = 'entry_ms' | 'session_ms' | 'tenant_context_ms' | 'translations_ms';

type LoginEntryTimingRecord = {
  event: 'login_entry_timing';
  v: 1;
  entry_ms?: number;
  session_ms?: number;
  tenant_context_ms?: number;
  translations_ms?: number;
  session_found?: boolean;
  redirect_requested?: true;
  entry_returned?: true;
};

const MAX_WINDOW_MS = 3_600_000;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const EPOCH_MS_PATTERN = /^(?:0|[1-9][0-9]*)$/;

const DURATION_KEYS: readonly DurationKey[] = [
  'entry_ms',
  'session_ms',
  'tenant_context_ms',
  'translations_ms',
];

const PHASE_DURATION_KEYS: Readonly<Record<LoginEntryTimingPhase, DurationKey>> = {
  session: 'session_ms',
  tenant_context: 'tenant_context_ms',
  translations: 'translations_ms',
};

const NOOP = (): void => {};

// One shared recorder for every disabled request: no clock read, no log, no per-request state.
const DISABLED_TIMING: LoginEntryTiming = Object.freeze({
  begin: () => NOOP,
  sessionResolved: NOOP,
  mark: NOOP,
  finishOnce: NOOP,
});

function defaultNow(): number {
  return performance.now();
}

function defaultEpochNow(): number {
  return performance.timeOrigin + performance.now();
}

function defaultLog(line: string): void {
  console.info(line);
}

function isPhase(value: unknown): value is LoginEntryTimingPhase {
  return value === 'session' || value === 'tenant_context' || value === 'translations';
}

function parseEpochMs(value: unknown): number | null {
  if (typeof value !== 'string' || !EPOCH_MS_PATTERN.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

// The immutable issued/expires interval cannot become valid merely because time passes when its
// configured duration exceeds one hour.
function isActivated(env: LoginEntryTimingEnv, epochNow: () => number): boolean {
  if (env.VERCEL_ENV !== 'preview') return false;

  const actualSha = env.COMMIT_SHA;
  if (typeof actualSha !== 'string' || !COMMIT_SHA_PATTERN.test(actualSha)) return false;
  if (env.LOGIN_ENTRY_TIMING_TARGET_SHA !== actualSha) return false;

  const issuedAt = parseEpochMs(env.LOGIN_ENTRY_TIMING_ISSUED_AT);
  const expiresAt = parseEpochMs(env.LOGIN_ENTRY_TIMING_EXPIRES_AT);
  if (issuedAt === null || expiresAt === null) return false;
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_WINDOW_MS) return false;

  const current = epochNow();
  return Number.isFinite(current) && issuedAt <= current && current < expiresAt;
}

function readClock(now: () => number): number | null {
  try {
    const value = now();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

// Unknown, non-finite or backward measurements are omitted rather than reported as zero.
function elapsed(start: number | null, end: number | null): number | null {
  if (start === null || end === null) return null;
  const value = end - start;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function createActiveTiming(now: () => number, log: (line: string) => void): LoginEntryTiming {
  const startedAt = readClock(now);
  const durations: Partial<Record<DurationKey, number>> = {};
  const begun: Partial<Record<LoginEntryTimingPhase, true>> = {};
  let sessionFound: boolean | undefined;
  let redirectRequested = false;
  let entryReturned = false;
  let sealed = false;

  return {
    begin(phase) {
      if (sealed || !isPhase(phase) || begun[phase]) return NOOP;
      begun[phase] = true;
      const phaseStart = readClock(now);
      if (phaseStart === null) return NOOP;

      let finished = false;
      return () => {
        if (sealed || finished) return;
        finished = true;
        const value = elapsed(phaseStart, readClock(now));
        if (value !== null) durations[PHASE_DURATION_KEYS[phase]] = value;
      };
    },
    sessionResolved(found) {
      if (sealed || sessionFound !== undefined || typeof found !== 'boolean') return;
      sessionFound = found;
    },
    mark(name) {
      if (sealed) return;
      if (name === 'redirect_requested') redirectRequested = true;
      else if (name === 'entry_returned') entryReturned = true;
    },
    finishOnce() {
      if (sealed) return;
      sealed = true;
      try {
        const entryMs = elapsed(startedAt, readClock(now));
        if (entryMs !== null) durations.entry_ms = entryMs;

        const record: LoginEntryTimingRecord = { event: 'login_entry_timing', v: 1 };
        for (const key of DURATION_KEYS) {
          const value = durations[key];
          if (value !== undefined) record[key] = value;
        }
        if (sessionFound !== undefined) record.session_found = sessionFound;
        if (redirectRequested) record.redirect_requested = true;
        if (entryReturned) record.entry_returned = true;

        log(JSON.stringify(record));
      } catch {
        // Observation must never replace the page result or an original redirect/error.
      }
    },
  };
}

export function createLoginEntryTiming(deps: LoginEntryTimingDeps = {}): LoginEntryTiming {
  try {
    if (!isActivated(deps.env ?? process.env, deps.epochNow ?? defaultEpochNow)) {
      return DISABLED_TIMING;
    }
    return createActiveTiming(deps.now ?? defaultNow, deps.log ?? defaultLog);
  } catch {
    return DISABLED_TIMING;
  }
}
