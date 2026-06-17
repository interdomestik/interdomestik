export function normalizeRoutingNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}
