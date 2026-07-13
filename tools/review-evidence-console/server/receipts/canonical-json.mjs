export const RECEIPT_SIGNATURE_DOMAIN = 'REC02-RECEIPT-SIGNATURE-V1\0';

function normalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value !== 'object') throw new TypeError('Non-canonical JSON value.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Non-canonical object.');
  const result = Object.create(null);
  const keys = Object.keys(value).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  for (const key of keys) {
    if (value[key] === undefined) throw new TypeError('Undefined is not canonical JSON.');
    result[key] = normalize(value[key]);
  }
  return result;
}

export function canonicalReceiptJson(value) {
  return JSON.stringify(normalize(value));
}

export function canonicalReceiptBytes(value) {
  return new TextEncoder().encode(RECEIPT_SIGNATURE_DOMAIN + canonicalReceiptJson(value));
}
