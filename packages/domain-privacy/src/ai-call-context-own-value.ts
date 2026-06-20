/**
 * Sentinel returned when an own property is an accessor instead of a data property.
 * This prevents getter/setter execution while validating untrusted input.
 */
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

  // Reject accessors (getters/setters) to prevent code execution on untrusted input.
  return 'value' in descriptor ? descriptor.value : UNREADABLE_OWN_VALUE;
}

export function snapshotOwnValues(
  value: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};

  for (const key of keys) {
    const descriptor = ownDescriptor(value, key);
    if (!descriptor) continue;
    snapshot[key] = 'value' in descriptor ? descriptor.value : UNREADABLE_OWN_VALUE;
  }

  return snapshot;
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
