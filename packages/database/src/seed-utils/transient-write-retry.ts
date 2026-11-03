const TRANSIENT_DB_WRITE_ERROR_CODES = new Set(['EADDRNOTAVAIL', 'ECONNRESET', 'ETIMEDOUT']);

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientDbWriteError(error: unknown): boolean {
  const err = error as { code?: string; cause?: { code?: string } };
  return (
    TRANSIENT_DB_WRITE_ERROR_CODES.has(String(err?.code || '')) ||
    TRANSIENT_DB_WRITE_ERROR_CODES.has(String(err?.cause?.code || ''))
  );
}

export async function withTransientDbWriteRetry<T>(
  label: string,
  run: () => Promise<T>
): Promise<T> {
  const maxAttempts = 3;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await run();
    } catch (error) {
      if (!isTransientDbWriteError(error) || attempt >= maxAttempts) {
        throw error;
      }
      const delayMs = attempt * 200;
      console.warn(
        `[seed:ks-workflow] transient db write failure for ${label}; retrying attempt ${attempt + 1}/${maxAttempts} after ${delayMs}ms`
      );
      await sleep(delayMs);
    }
  }

  throw new Error(`unreachable retry state for ${label}`);
}
