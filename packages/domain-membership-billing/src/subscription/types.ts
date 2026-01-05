export type SubscriptionSession = {
  user: {
    id: string;
    tenantId?: string | null;
  };
};

export type PaymentUpdateUrlResult =
  | { url: string; error?: undefined }
  | { error: string; url?: undefined };

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

export type SubscriptionDeps = {
  logAuditEvent?: AuditLogger;
};

export type CancelSubscriptionResult =
  | { success: true; error?: undefined }
  | { error: string; success?: undefined };
