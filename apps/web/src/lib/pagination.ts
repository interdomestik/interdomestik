/**
 * The one page clamp for list reads that take a page or a page size from a request (R-20,
 * REUSE-CATALOG "Pagination and page-size limits"). Domain queries receive bounded numbers.
 */
export const MAX_PER_PAGE = 50;

export function clampPage(value: number) {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

export function clampPerPage(value: number, fallback: number) {
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), MAX_PER_PAGE);
}
