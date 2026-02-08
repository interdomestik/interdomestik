export function getSelectedClaimId(searchParams: URLSearchParams): string | null {
  const selected = searchParams.get('selected');
  if (selected) return selected;

  const claimId = searchParams.get('claimId');
  if (claimId) return claimId;

  return null;
}
