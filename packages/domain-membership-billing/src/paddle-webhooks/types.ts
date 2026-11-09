import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

// An audit row is written inside the tenant that owns it, so every event carries the authority the
// effect ran under rather than a tenant id the logger would have to trust.
export type AuditEvent = {
  authority: TenantAuthority;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  headers?: Headers;
};

export type AuditLogger = (event: AuditEvent) => Promise<void> | void;

export type PaddleWebhookAuditDeps = {
  logAuditEvent?: AuditLogger;
};

export type SendPaymentFailedEmail = (
  to: string,
  params: {
    accessContinues?: boolean;
    memberName: string;
    planName: string;
    gracePeriodDays: number;
    gracePeriodEndDate: string;
  }
) => unknown;

export type PreparedPastDueEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type PastDueEmailDeps = {
  preparePastDueEmail?: (
    to: string,
    params: Parameters<SendPaymentFailedEmail>[1]
  ) => PreparedPastDueEmail;
  sendPreparedPastDueEmail?: (
    request: PreparedPastDueEmail,
    idempotencyKey: string
  ) => Promise<{ success: true; id: string } | { success: false; error: string }>;
};

export type PreparedMembershipConfirmationEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type PrepareThankYouLetter = (params: {
  email: string;
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  memberSince: Date;
  expiresAt: Date;
  providerReference: string;
  tenantId: string;
  locale: 'en' | 'sq' | 'mk' | 'sr' | 'de';
}) => PreparedMembershipConfirmationEmail;

export type SendThankYouLetter = (params: {
  request: PreparedMembershipConfirmationEmail;
  providerReference: string;
  tenantId: string;
  idempotencyKey: string;
}) =>
  | Promise<{ success: true; id: string } | { success: false; error: string }>
  | { success: true; id: string }
  | { success: false; error: string };

export type MembershipConfirmationSnapshot = {
  email: string;
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  memberSince: string;
  expiresAt: string;
  locale: 'en' | 'sq' | 'mk' | 'sr' | 'de';
  tenantId: string;
  userId: string;
  subscriptionId: string;
  providerReference: string;
  providerEventId: string;
  webhookPayloadHash: string;
  providerStatus: 'active';
  eventType: 'subscription.created';
  emailRequest: PreparedMembershipConfirmationEmail;
};

export type MembershipConfirmationEvidence = Pick<
  MembershipConfirmationSnapshot,
  | 'tenantId'
  | 'userId'
  | 'subscriptionId'
  | 'providerReference'
  | 'providerEventId'
  | 'webhookPayloadHash'
>;

export type MembershipConfirmationRetryEvidence = Pick<
  MembershipConfirmationSnapshot,
  'tenantId' | 'providerReference' | 'providerEventId' | 'webhookPayloadHash'
>;

export type MembershipConfirmationClaim =
  | {
      kind: 'claimed';
      deliveryId: string;
      requiresEffects: boolean;
      snapshot: MembershipConfirmationSnapshot;
    }
  | { kind: 'already_sent' | 'already_skipped' | 'conflict' | 'in_progress' };

/**
 * Every store call runs under the tenant authority of the webhook delivery that owns the claim; a
 * snapshot, evidence or stored row naming a different tenant fails closed.
 */
export type MembershipConfirmationDeliveryStore = {
  claimReadyRetry?: (params: {
    authority: TenantAuthority;
    evidence: MembershipConfirmationRetryEvidence;
    idempotencyKey: string;
  }) => Promise<MembershipConfirmationClaim | { kind: 'not_found' } | { kind: 'requires_context' }>;
  claimExisting: (params: {
    authority: TenantAuthority;
    evidence: MembershipConfirmationEvidence;
    idempotencyKey: string;
  }) => Promise<MembershipConfirmationClaim | { kind: 'not_found' }>;
  claim: (params: {
    authority: TenantAuthority;
    idempotencyKey: string;
    snapshot: MembershipConfirmationSnapshot;
  }) => Promise<MembershipConfirmationClaim>;
  ready: (params: {
    authority: TenantAuthority;
    deliveryId: string;
    idempotencyKey: string;
    subscriptionId: string;
  }) => Promise<void>;
  skip: (params: {
    authority: TenantAuthority;
    deliveryId: string;
    idempotencyKey: string;
  }) => Promise<void>;
  complete: (params: {
    authority: TenantAuthority;
    deliveryId: string;
    idempotencyKey: string;
    providerMessageId: string;
  }) => Promise<void>;
  fail: (params: {
    authority: TenantAuthority;
    deliveryId: string;
    error: string;
    idempotencyKey: string;
  }) => Promise<void>;
};

export type RequestPasswordResetOnboarding = (params: {
  email: string;
  tenantId: string;
}) => Promise<void> | void;

export type CheckoutCustomData = {
  userId?: string;
  agentId?: string;
  tenantId?: string;
  locale?: unknown;
  acquisitionSource?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
};

export type SubscriptionPayloadLike = {
  id: string;
  customerId?: string | null;
  customer_id?: string | null;
  transactionId?: string | null;
  transaction_id?: string | null;
  currencyCode?: string | null;
  currency_code?: string | null;
  customData?: CheckoutCustomData;
  custom_data?: CheckoutCustomData;
  items?: Array<{
    price?: { id?: string | null } | null;
    priceId?: string | null;
    price_id?: string | null;
    quantity?: number | null;
  }> | null;
};

export type PaddleCustomerLookupResult =
  | {
      kind: 'resolved';
      customer: { id: string; email: string; status: 'active' | 'archived' };
    }
  | { kind: 'failed'; retryable: boolean };

export type ResolvePaddleCustomer = (
  customerId: string
) => Promise<PaddleCustomerLookupResult> | PaddleCustomerLookupResult;

export type PaddleWebhookDeps = PastDueEmailDeps & {
  sendPaymentFailedEmail?: SendPaymentFailedEmail;
  prepareThankYouLetter?: PrepareThankYouLetter;
  sendThankYouLetter?: SendThankYouLetter;
  membershipConfirmationDelivery?: MembershipConfirmationDeliveryStore;
  requestPasswordResetOnboarding?: RequestPasswordResetOnboarding;
  resolvePaddleCustomer?: ResolvePaddleCustomer;
};
