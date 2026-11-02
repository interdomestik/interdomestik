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

  // Past the last attempt the last error is thrown (undefined when no attempt was allowed).
  const attemptFrom = async (attempt: number, lastError?: unknown): Promise<T> => {
    if (attempt > attempts) throw lastError;
    try {
      return await fn();
    } catch (err) {
      if (attempt < attempts) await sleep(baseDelayMs * 2 ** (attempt - 1));
      return attemptFrom(attempt + 1, err);
    }
  };
  return attemptFrom(1);
}
