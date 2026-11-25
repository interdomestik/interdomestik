import { unstable_rethrow } from 'next/navigation';

const SQLSTATE = /^[0-9A-Z]{5}$/;

function sqlState(error: unknown, depth = 0): string | undefined {
  if (!error || typeof error !== 'object' || depth > 3) return undefined;
  if ('code' in error && typeof error.code === 'string' && SQLSTATE.test(error.code)) {
    return error.code;
  }
  return 'cause' in error ? sqlState(error.cause, depth + 1) : undefined;
}

/**
 * Database exceptions can carry query parameters (a party contact name, an insurance reference, a
 * consent purpose). Only a fixed message and the SQLSTATE leave the register's action boundary;
 * Next control flow is rethrown unchanged.
 */
export function parameterFreeFailure(error: unknown, operation: string): Error {
  unstable_rethrow(error);
  const code = sqlState(error);
  return new Error(
    code ? `Unexpected ${operation} failure (SQLSTATE ${code})` : `Unexpected ${operation} failure`
  );
}

export async function withoutParameters<T>(work: Promise<T>, operation: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    throw parameterFreeFailure(error, operation);
  }
}
