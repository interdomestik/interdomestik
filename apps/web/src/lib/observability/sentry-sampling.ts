/**
 * Enablement gate and sample-rate resolution shared by the browser, server and edge Sentry
 * runtimes.
 *
 * Every environment override is parsed fail closed: a blank, malformed or out-of-range value
 * resolves to `0` instead of silently capturing every trace, span or replay. Only an absent
 * override falls back to the modest repository default.
 */

/** Documented example DSN; it must never enable a live telemetry runtime. */
export const SENTRY_PLACEHOLDER_DSN = 'https://your-dsn@sentry.io/project-id';

/** Modest default performance sampling for an enabled production runtime. */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

/** Ordinary sampled sessions stay rare; Replay is the most sensitive signal we collect. */
export const DEFAULT_REPLAY_SESSION_SAMPLE_RATE = 0.01;

/** Error sessions are the diagnostic case worth a higher, still bounded, rate. */
export const DEFAULT_REPLAY_ON_ERROR_SAMPLE_RATE = 0.1;

export type SentryEnablementInput = Readonly<{
  dsn: string | undefined;
  nodeEnv: string | undefined;
  automated: boolean;
}>;

/**
 * Keeps the established gate: telemetry is only live for a production build with a real DSN
 * outside automated runs.
 */
export function isSentryTelemetryEnabled({
  dsn,
  nodeEnv,
  automated,
}: SentryEnablementInput): boolean {
  if (nodeEnv !== 'production' || automated) return false;
  if (!dsn || dsn === SENTRY_PLACEHOLDER_DSN) return false;
  try {
    const url = new URL(dsn);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !!url.username &&
      !!url.hostname &&
      /^\/\d+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isUsableRate(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Resolves a sample rate from an environment override.
 *
 * - absent override: the caller's default rate (clamped fail closed)
 * - explicit `0`: sampling disabled
 * - blank, non-numeric or out-of-range override: `0`, never an implicit capture-everything
 */
export function resolveSampleRate(
  rawValue: string | undefined | null,
  defaultRate: number
): number {
  if (rawValue === undefined || rawValue === null) {
    return isUsableRate(defaultRate) ? defaultRate : 0;
  }

  const trimmed = rawValue.trim();
  if (trimmed === '') return 0;

  const parsed = Number(trimmed);
  return isUsableRate(parsed) ? parsed : 0;
}

/** Resolves the rate only for an enabled runtime; a disabled runtime samples nothing. */
export function resolveEnabledSampleRate(
  isEnabled: boolean,
  rawValue: string | undefined | null,
  defaultRate: number
): number {
  return isEnabled ? resolveSampleRate(rawValue, defaultRate) : 0;
}
