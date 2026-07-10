export const failure = (code, message) => ({ ok: false, code, message });

export function storageFailure(error) {
  if (error?.name === 'QuotaExceededError') {
    return failure('quota', 'Local storage is full. Export a recovery copy and retry.');
  }
  return failure('unavailable', 'Local storage is unavailable on this device.');
}

export const isRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const isIsoDate = value =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
