export function formatZodFieldErrors(errors: Record<string, string[] | undefined>) {
  const formattedErrors: Record<string, string> = {};

  Object.keys(errors).forEach(key => {
    const messages = errors[key];
    if (messages && messages.length > 0) {
      formattedErrors[key] = messages[0];
    }
  });

  return formattedErrors;
}

export function extractBranchIdFromSetting(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  return (
    (typeof obj.branchId === 'string' && obj.branchId) ||
    (typeof obj.defaultBranchId === 'string' && obj.defaultBranchId) ||
    (typeof obj.id === 'string' && obj.id) ||
    (typeof obj.value === 'string' && obj.value) ||
    undefined
  );
}
