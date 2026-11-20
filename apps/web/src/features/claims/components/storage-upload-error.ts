export function isDuplicateStorageUploadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
  };
  if (String(value.statusCode ?? value.status) === '409') return true;
  if (
    typeof value.code === 'string' &&
    /^(Duplicate|ResourceAlreadyExists|already_exists)$/.test(value.code)
  )
    return true;
  return (
    typeof value.message === 'string' &&
    /^(The resource already exists|Resource already exists|already exists)$/i.test(value.message)
  );
}
