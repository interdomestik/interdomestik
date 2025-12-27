export type InternalSubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'paused'
  | 'canceled'
  | 'trialing'
  | 'expired';

export function mapPaddleStatus(status: string): InternalSubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'paused':
      return 'paused';
    case 'canceled':
    case 'deleted':
      return 'canceled';
    case 'trialing':
      return 'trialing';
    default:
      return 'expired';
  }
}
