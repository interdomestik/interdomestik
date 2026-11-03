const KEY_BYTES = 16;

/**
 * Idempotency key for one message send. `crypto.randomUUID` exists only in secure contexts, so a
 * plain-HTTP origin falls back to `getRandomValues`, which every browser exposes.
 */
export function createClientMessageId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  return `msg-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
