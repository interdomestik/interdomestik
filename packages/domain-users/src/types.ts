export type UserSession = {
  user: {
    id: string;
    role: string;
    tenantId?: string | null;
    name?: string | null;
    email?: string | null;
    branchId?: string | null; // Added Phase 2
    agentId?: string | null; // Added Phase 2
  };
};

export type ActionResult<T = unknown> = { success: true; data?: T } | { error: string };

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

export type UserDomainDeps = {
  logAuditEvent?: AuditLogger;
};
