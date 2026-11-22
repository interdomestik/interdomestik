import type { notificationDeliveries } from '@interdomestik/database/schema';
import type { DeliveryOutcome } from '../delivery-outcome';
import type { EmailTransport, sendEmailOutcome } from '../email';
import type { sendPushOutcome } from '../push';

export type Delivery = typeof notificationDeliveries.$inferSelect;
export type ClaimedDelivery = Delivery & { leaseUntil: string };
export type DeliveryTransport = NonNullable<Delivery['transport']>;
export type SkipReason = NonNullable<Delivery['skipReason']>;
export type PushDeliverySubscription = Parameters<typeof sendPushOutcome>[0] & {
  version: string;
};

export type DeliveryDependencies = {
  appOrigin: (tenantId: string) => string;
  now?: () => number;
  emailTransports?: () => readonly EmailTransport[];
  sendEmail?: typeof sendEmailOutcome;
  pushConfigured?: () => boolean;
  sendPush?: typeof sendPushOutcome;
};

export type AttemptResult = DeliveryOutcome<DeliveryTransport> | { skip: SkipReason };

export type RunSummary = {
  sent: number;
  skipped: number;
  queued: number;
  failed: number;
  lease_lost: number;
  lease_short: number;
  budget_short: number;
  failures: { id: string; code: string }[];
};
