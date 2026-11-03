export const DEFAULT_RETRY_ATTEMPTS = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 250;

export function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export function stringifyError(err: unknown) {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number }
): Promise<T> {
  const attempts = opts?.attempts ?? DEFAULT_RETRY_ATTEMPTS;
  const baseDelayMs = opts?.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;

  // With no attempt allowed nothing runs and, as before, an undefined last error is thrown.
  const noAttemptError: unknown = undefined;
  if (attempts < 1) throw noAttemptError;

  const attemptFrom = async (attempt: number): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts) throw err;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      return attemptFrom(attempt + 1);
    }
  };
  return attemptFrom(1);
}
