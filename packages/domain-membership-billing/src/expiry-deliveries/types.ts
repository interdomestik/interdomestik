import type { sendEmailOutcome } from '@interdomestik/domain-communications/email';
import type {
  VerifiedRecipient,
  VerifiedRecipientHandle,
} from '@interdomestik/domain-communications/recipient-locale';

export type ExpiryDeliveryKey = Readonly<{ tenantId: string; periodId: string }>;
export type ExpiryLease = Readonly<{ token: string; expiresAt: number }>;
export type ExpiryAuthorization = Readonly<{
  leaseToken: string;
  authorizedAt: number;
  transportDeadline: number;
}>;

export type ExpiryDeliveryState = Readonly<{
  state: 'queued' | 'claimed' | 'sent' | 'skipped' | 'failed';
  attempts: number;
  nextAttemptAt: number | null;
  terminalAt: number | null;
  lease: ExpiryLease | null;
  authorization: ExpiryAuthorization | null;
  code: string | null;
}>;

export type ExpiryDeliveryRecord = ExpiryDeliveryKey &
  Readonly<{ reference: string; metadata: ExpiryDeliveryState }>;

export type ClaimedExpiryDelivery = Readonly<{
  periodId: string;
  leaseToken: string;
  handle: VerifiedRecipientHandle;
}>;

export type ExpiryDeliveryOptions = Readonly<{
  transport: Parameters<typeof sendEmailOutcome>[0];
  timeoutMs: number;
  finishReserveMs: number;
  render: (
    periodId: string,
    recipient: VerifiedRecipient
  ) => Parameters<typeof sendEmailOutcome>[2];
  now?: () => number;
}>;
