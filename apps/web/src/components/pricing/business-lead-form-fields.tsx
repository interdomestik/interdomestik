export function FieldError({ id, message }: Readonly<{ id: string; message?: string }>) {
  return message ? (
    <p id={id} className="text-sm font-medium text-red-600">
      {message}
    </p>
  ) : null;
}

export function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `business-lead-${Date.now()}`;
}
