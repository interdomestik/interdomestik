export function createRoleAssignmentId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto);
  }

  const getRandomValues = globalThis.crypto?.getRandomValues;
  if (typeof getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    getRandomValues.call(globalThis.crypto, bytes);
    const suffix = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `role_${suffix}`;
  }

  throw new Error('Secure random ID generation is unavailable');
}
