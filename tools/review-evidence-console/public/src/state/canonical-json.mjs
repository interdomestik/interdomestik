function normalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value !== 'object') throw new TypeError('Value is not canonical JSON.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Value is not canonical JSON.');
  }
  const normalized = Object.create(null);
  const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
  for (const key of Object.keys(value).sort(compare)) {
    if (value[key] === undefined) throw new TypeError('Value is not canonical JSON.');
    normalized[key] = normalize(value[key]);
  }
  return normalized;
}

export function canonicalStringify(value) {
  return JSON.stringify(normalize(value));
}
