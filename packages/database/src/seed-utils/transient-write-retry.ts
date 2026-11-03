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

const MAX_ATTEMPTS = 3;

async function attemptWrite<T>(label: string, run: () => Promise<T>, attempt: number): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isTransientDbWriteError(error) || attempt >= MAX_ATTEMPTS) {
      throw error;
    }
    const delayMs = attempt * 200;
    console.warn(
      `[seed:ks-workflow] transient db write failure for ${label}; retrying attempt ${attempt + 1}/${MAX_ATTEMPTS} after ${delayMs}ms`
    );
    await sleep(delayMs);
    return attemptWrite(label, run, attempt + 1);
  }
}

export function withTransientDbWriteRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  return attemptWrite(label, run, 1);
}
