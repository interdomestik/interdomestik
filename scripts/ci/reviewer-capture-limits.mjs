// Output capture limits for reviewer subprocesses.
//
// The stdout cap terminates a reviewer that writes more than it, so it bounds runaway output, the
// parent's per-chunk scanning cost and the size of the receipt. It is not a completion guarantee: a
// reviewer that needs more than the ceiling is blocked and reported, never silently accommodated.
export const STDOUT_CAPTURE_DEFAULT_BYTES = 256_000;
// Ceiling for any override. Per-chunk rescanning cost 4-22 s of parent CPU at 1 MiB across two measured
// workloads: an observation, not a bound. A larger allowance needs a code change and review.
export const STDOUT_CAPTURE_MAX_BYTES = 1_048_576;
export const STDERR_CAPTURE_BYTES = 20_000;
export const STDOUT_CAPTURE_ENV = 'REVIEWER_MAX_STDOUT_BYTES';

const CANONICAL_DECIMAL = /^[1-9]\d{0,15}$/u;

function parseBytes(value) {
  if (typeof value === 'string' && !CANONICAL_DECIMAL.test(value)) return null;
  const bytes = typeof value === 'string' ? Number(value) : value;
  const valid = Number.isSafeInteger(bytes) && bytes >= 1 && bytes <= STDOUT_CAPTURE_MAX_BYTES;
  return valid ? bytes : null;
}

// Precedence: explicit option, then environment, then default. An empty environment value counts as
// unset (CI systems pass unset variables as empty strings); every other value must validate, and an
// invalid value is rejected rather than clamped so a receipt never records a limit nobody chose.
export function resolveCaptureLimits(option, env) {
  const fromOption = option !== undefined;
  const fromEnv = env?.[STDOUT_CAPTURE_ENV];
  const raw = fromOption ? option : fromEnv;
  const source = fromOption
    ? 'option'
    : raw === undefined || raw === ''
      ? 'default'
      : 'environment';
  if (source === 'default') {
    const limits = { stdoutBytes: STDOUT_CAPTURE_DEFAULT_BYTES, stderrBytes: STDERR_CAPTURE_BYTES };
    return { limits: { ...limits, source }, error: '' };
  }
  const stdoutBytes = parseBytes(raw);
  if (stdoutBytes === null) {
    const name = fromOption ? 'maxCaptureBytes' : STDOUT_CAPTURE_ENV;
    const shown = JSON.stringify(String(raw)).slice(0, 48);
    const error = `${name} must be an integer from 1 to ${STDOUT_CAPTURE_MAX_BYTES}; received ${shown}`;
    return { limits: null, error };
  }
  return { limits: { stdoutBytes, stderrBytes: STDERR_CAPTURE_BYTES, source }, error: '' };
}
