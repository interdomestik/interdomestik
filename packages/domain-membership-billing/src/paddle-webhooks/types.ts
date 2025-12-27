export type AuditEvent = {
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
    memberName: string;
    planName: string;
    gracePeriodDays: number;
    gracePeriodEndDate: string;
  }
) => Promise<unknown> | unknown;

export type SendThankYouLetter = (params: {
  email: string;
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  memberSince: Date;
  expiresAt: Date;
  locale?: 'en' | 'sq';
}) => Promise<{ success: boolean; error?: string } | unknown>;

export type PaddleWebhookDeps = {
  sendPaymentFailedEmail?: SendPaymentFailedEmail;
  sendThankYouLetter?: SendThankYouLetter;
};
