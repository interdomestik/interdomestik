export const UNREADABLE_OWN_VALUE = Symbol('unreadable-own-value');

function ownDescriptor(
  value: Record<string, unknown>,
  key: string
): PropertyDescriptor | undefined {
  return Object.getOwnPropertyDescriptor(value, key);
}

export function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
  return ownDescriptor(value, key) !== undefined;
}

export function readOwnValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = ownDescriptor(value, key);

  if (!descriptor) {
    return undefined;
  }

  // Reject accessors instead of invoking getters on untrusted input.
  return 'value' in descriptor ? descriptor.value : UNREADABLE_OWN_VALUE;
}

export function readOwnTrimmedString(
  value: Record<string, unknown>,
  key: string
): string | typeof UNREADABLE_OWN_VALUE | undefined {
  const ownValue = readOwnValue(value, key);

  if (ownValue === UNREADABLE_OWN_VALUE) {
    return ownValue;
  }

  return typeof ownValue === 'string' ? ownValue.trim() : undefined;
}
