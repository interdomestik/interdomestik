export function hasOwnKey(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function readOwnValue(value: Record<string, unknown>, key: string): unknown {
  return hasOwnKey(value, key) ? value[key] : undefined;
}
