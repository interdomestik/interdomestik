import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
export type SubscriptionSession = {
  user: {
    id: string;
    tenantId?: string | null;
    role?: string | null;
  };
};

export type PaymentUpdateUrlResult =
  { url: string; error: undefined } | { error: string; url: undefined };

export type AuditEvent = {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  authority: TenantAuthority;
  metadata?: Record<string, unknown>;
  headers?: Headers;
};

export type AuditLogger = (event: AuditEvent) => Promise<void> | void;

export type SubscriptionDeps = {
  logAuditEvent?: AuditLogger;
};

export type CancellationTermsSummary = {
  coolingOffAppliesSeparately: true;
  currentPeriodEndsAt: string | null;
  effectiveFrom: 'next_billing_period';
  hasAcceptedEscalation: boolean;
  refundStatus: 'eligible' | 'outside_window' | 'blocked_by_accepted_escalation';
  refundWindowEndsAt: string | null;
};

export type CancelSubscriptionResult =
  | { success: true; error: undefined; cancellationTerms: CancellationTermsSummary }
  | { error: string; success: undefined };
