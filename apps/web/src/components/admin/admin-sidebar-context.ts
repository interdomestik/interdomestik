/**
 * Query parameters that survive admin navigation. Only the tenant context is
 * carried forward; every other parameter stays owned by its originating screen.
 */
export const PERSISTED_ADMIN_CONTEXT_PARAMS = new Set(['tenantId']);

/**
 * Minimal readonly entries contract satisfied by both `URLSearchParams` and
 * Next's `ReadonlyURLSearchParams`.
 */
export interface AdminContextParamSource {
  entries(): Iterable<[string, string]>;
}

/**
 * Merge the persisted admin context from `source` into `href`.
 *
 * Destination query values always win: any key present on `href` fully
 * replaces the carried values for that key, while repeated values and their
 * relative order are preserved on both sides.
 */
export function withAdminContext(href: string, source: AdminContextParamSource): string {
  const [path, queryString] = href.split('?');
  const merged = new URLSearchParams();

  for (const [key, value] of source.entries()) {
    if (PERSISTED_ADMIN_CONTEXT_PARAMS.has(key)) {
      merged.append(key, value);
    }
  }

  if (queryString) {
    const destinationParams = new URLSearchParams(queryString);
    const destinationKeys = new Set(Array.from(destinationParams.keys()));
    for (const key of destinationKeys) {
      merged.delete(key);
      for (const value of destinationParams.getAll(key)) {
        merged.append(key, value);
      }
    }
  }

  const next = merged.toString();
  return next ? `${path}?${next}` : path;
}
