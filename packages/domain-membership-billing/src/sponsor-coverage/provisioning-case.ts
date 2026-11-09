/**
 * ACQ-3b §3.7 provisioning cases for one admitted, accepted entry of an effective term with
 * `term_start ≤ now < effective_end`. The case is decided from durable facts read under the
 * person's locks; the caller applies its effects in the same transaction.
 */
export type SubscriptionStatus =
  'active' | 'past_due' | 'paused' | 'canceled' | 'trialing' | 'expired';

export type ProvisioningFacts =
  | { kind: 'created' }
  | { kind: 'not_visible' }
  | {
      kind: 'visible';
      role: string;
      subscription: { provider: string | null; status: SubscriptionStatus | null } | null;
    };

export type ProvisioningCase =
  /** New account: unverified member, a group_sponsor row, `starts_at = now`, notice + activation. */
  | 'new_user'
  /** The address belongs to an account this tenant cannot see. */
  | 'foreign'
  /** A visible account that is not a member. */
  | 'not_eligible'
  /** No Paddle row, or one that cannot renew: start now. */
  | 'immediate'
  /** An `active` Paddle row: link the handover intent; the worker stops the renewal. */
  | 'handover'
  /** `trialing`, `past_due` or `paused`: staff act; nothing covers until they do. */
  | 'paddle_review';

const CANNOT_RENEW: ReadonlySet<SubscriptionStatus> = new Set(['canceled', 'expired']);
const STAFF_REVIEW: ReadonlySet<SubscriptionStatus> = new Set(['trialing', 'past_due', 'paused']);

export function classifyProvisioning(facts: ProvisioningFacts): ProvisioningCase {
  if (facts.kind === 'created') return 'new_user';
  if (facts.kind === 'not_visible') return 'foreign';
  if (facts.role !== 'member') return 'not_eligible';
  const row = facts.subscription;
  // A group_sponsor row is the sponsor cache, not a Paddle row.
  if (row?.provider !== 'paddle' || row.status === null) return 'immediate';
  if (CANNOT_RENEW.has(row.status)) return 'immediate';
  if (STAFF_REVIEW.has(row.status)) return 'paddle_review';
  return 'handover';
}
