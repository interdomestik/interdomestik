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

export type SendThankYouLetter = (params: {
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
}) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };

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
  sendThankYouLetter?: SendThankYouLetter;
  requestPasswordResetOnboarding?: RequestPasswordResetOnboarding;
  resolvePaddleCustomer?: ResolvePaddleCustomer;
};
