let fallbackCounter = 0;

export function createClientRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(4);
    globalThis.crypto.getRandomValues(bytes);
    return `req_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
  }

  fallbackCounter += 1;
  return `req_${Date.now().toString(36)}_${fallbackCounter.toString(36).padStart(4, '0')}`;
}
