// Pure query building for the admin users search: the raw draft term and the
// retained navigation target decide the next url, with no router, state or
// timers. A new term resets pagination; every other param is preserved.

/** Applies the draft term to a retained query, resetting pagination. */
export function buildSearchQuery(retainedQuery: string, draft: string): string {
  const params = new URLSearchParams(retainedQuery);
  params.delete('page');
  if (draft) params.set('search', draft);
  else params.delete('search');
  return params.toString();
}

/**
 * Carries the draft into an href. A filter href contributes its own param
 * only, so a queued role or assignment target survives an unrelated change.
 */
export function buildDraftSearchHref(
  href: string,
  draft: string,
  retainedQuery: string,
  filter?: 'role' | 'assignment'
): string {
  const [targetPath, query = ''] = href.split('?');
  const nextParams = new URLSearchParams(filter ? retainedQuery : query);
  if (filter) {
    const value = new URLSearchParams(query).get(filter);
    if (value) nextParams.set(filter, value);
    else nextParams.delete(filter);
  }
  const nextQuery = buildSearchQuery(nextParams.toString(), draft);
  return nextQuery ? `${targetPath}?${nextQuery}` : targetPath;
}

/**
 * Decides whether a retained target still has to be reasserted once an older
 * acknowledgement arrives: only when nothing is already requested and the
 * published query is not the retained target yet.
 */
export function shouldReassert(
  requestedQuery: string | null,
  targetQuery: string,
  publishedQuery: string
): boolean {
  return requestedQuery === null && targetQuery !== publishedQuery;
}
