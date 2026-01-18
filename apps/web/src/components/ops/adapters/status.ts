export type OpsStatusVariant = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

/**
 * Maps common domain statuses to OpsStatusBadge variants.
 * Centralizing this here prevents duplication across claims, verification, and lead pages.
 */
export function toOpsBadgeVariant(input: string | undefined | null): OpsStatusVariant {
  if (!input) return 'neutral';

  const status = input.toLowerCase();

  // Verification statuses
  if (['approved', 'verified', 'active', 'completed', 'paid'].includes(status)) return 'success';
  if (['pending', 'in_progress', 'draft', 'started'].includes(status)) return 'info';
  if (['waiting', 'under_review', 'manual_check'].includes(status)) return 'warning';
  if (['rejected', 'failed', 'cancelled', 'error', 'expired'].includes(status)) return 'danger';

  // Claims specific
  if (status === 'open') return 'info';
  if (status === 'closed') return 'neutral';

  // Membership specific
  if (status === 'past_due') return 'warning';
  if (status === 'unpaid') return 'danger';

  return 'neutral';
}
