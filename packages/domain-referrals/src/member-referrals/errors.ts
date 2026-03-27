export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as {
    message?: string;
    cause?: { code?: string; message?: string };
  };

  if (maybeError.cause?.code === '42P01') {
    return true;
  }

  const message = maybeError.message ?? maybeError.cause?.message ?? '';
  return /relation .* does not exist/i.test(message);
}
