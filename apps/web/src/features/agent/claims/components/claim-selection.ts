export function getSelectedClaimId(searchParams: URLSearchParams): string | null {
  const selected = searchParams.get('selected');
  if (selected) return selected;

  const claimId = searchParams.get('claimId');
  if (claimId) return claimId;

  return null;
}

export function getClaimSelectionCloseHref(searchParams: URLSearchParams): string | null {
  if (!searchParams.has('selected') && !searchParams.has('claimId')) {
    return null;
  }

  const nextParams = new URLSearchParams(searchParams);
  nextParams.delete('selected');
  nextParams.delete('claimId');

  const nextQuery = nextParams.toString();
  return nextQuery ? `?${nextQuery}` : '?';
}
