const KEY_BYTES = 16;

/**
 * Idempotency key for one lead submission. `crypto.randomUUID` exists only in secure contexts, so
 * a plain-HTTP origin falls back to `getRandomValues`, which every browser exposes. Without the
 * fallback the dialog throws while rendering and takes the whole agent leads page down.
 */
export function newLeadRequestKey(): string {
  const { crypto } = globalThis;
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  return `lead-req-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
