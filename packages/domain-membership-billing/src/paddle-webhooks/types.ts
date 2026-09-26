export type AuditEvent = {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  tenantId?: string | null;
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
    memberName: string;
    planName: string;
    gracePeriodDays: number;
    gracePeriodEndDate: string;
  }
) => unknown;

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
  locale: 'en' | 'sq' | 'mk' | 'sr';
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
  locale: 'en' | 'sq' | 'mk' | 'sr';
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

export type MembershipConfirmationClaim =
  | {
      kind: 'claimed';
      deliveryId: string;
      requiresEffects: boolean;
      snapshot: MembershipConfirmationSnapshot;
    }
  | { kind: 'already_sent' | 'conflict' | 'in_progress' };

export type MembershipConfirmationDeliveryStore = {
  claimExisting: (params: {
    evidence: MembershipConfirmationEvidence;
    idempotencyKey: string;
  }) => Promise<MembershipConfirmationClaim | { kind: 'not_found' }>;
  claim: (params: {
    idempotencyKey: string;
    snapshot: MembershipConfirmationSnapshot;
  }) => Promise<MembershipConfirmationClaim>;
  ready: (params: {
    deliveryId: string;
    idempotencyKey: string;
    subscriptionId: string;
    tenantId: string;
  }) => Promise<void>;
  complete: (params: {
    deliveryId: string;
    idempotencyKey: string;
    providerMessageId: string;
    tenantId: string;
  }) => Promise<void>;
  fail: (params: {
    deliveryId: string;
    error: string;
    idempotencyKey: string;
    tenantId: string;
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
  customData?: CheckoutCustomData;
  custom_data?: CheckoutCustomData;
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

export type PaddleWebhookDeps = {
  sendPaymentFailedEmail?: SendPaymentFailedEmail;
  prepareThankYouLetter?: PrepareThankYouLetter;
  sendThankYouLetter?: SendThankYouLetter;
  membershipConfirmationDelivery?: MembershipConfirmationDeliveryStore;
  requestPasswordResetOnboarding?: RequestPasswordResetOnboarding;
  resolvePaddleCustomer?: ResolvePaddleCustomer;
};
