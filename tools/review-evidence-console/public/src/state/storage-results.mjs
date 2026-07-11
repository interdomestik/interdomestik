export const failure = (code, message) => ({ ok: false, code, message });

export function storageFailure(error) {
  if (error?.name === 'QuotaExceededError') {
    return failure('quota', 'Ruajtja lokale është plot. Eksporto një kopje rikuperimi dhe provo përsëri.');
  }
  return failure('unavailable', 'Ruajtja lokale nuk është e disponueshme në këtë pajisje.');
}

export const isRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const isIsoDate = value =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
