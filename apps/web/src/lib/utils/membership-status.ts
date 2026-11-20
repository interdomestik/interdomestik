const MEMBERSHIP_STATUSES = new Set([
  'active',
  'past_due',
  'paused',
  'canceled',
  'none',
  'trialing',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'expired',
  'pending',
]);

export function membershipStatusKey(status: string | null | undefined): string {
  const key = status?.toLowerCase() || 'none';
  return MEMBERSHIP_STATUSES.has(key) ? key : 'unknown';
}
