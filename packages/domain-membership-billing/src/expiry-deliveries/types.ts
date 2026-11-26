import type { TenantTransaction } from '@interdomestik/database';
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

/** All operations use the caller's transaction. Locks are held through its commit. */
export interface ExpiryDeliveryStore {
  gateInTx(tx: TenantTransaction, tenantId: string): Promise<boolean>;
  lockEligiblePeriodInTx(
    tx: TenantTransaction,
    key: ExpiryDeliveryKey
  ): Promise<{ memberId: string | null } | null>;
  lockDeliveryInTx(
    tx: TenantTransaction,
    key: ExpiryDeliveryKey
  ): Promise<ExpiryDeliveryRecord | null>;
  /** Updates the locked key, comparing the prior state, lease and authorization. */
  saveDeliveryInTx(
    tx: TenantTransaction,
    locked: ExpiryDeliveryRecord,
    next: ExpiryDeliveryState
  ): Promise<boolean>;
}

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
