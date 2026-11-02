import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

export type UserSession = {
  user: {
    id: string;
    role: string;
    accessTenantId?: string | null;
    tenantId?: string | null;
    name?: string | null;
    email?: string | null;
    branchId?: string | null; // Added Phase 2
    agentId?: string | null; // Added Phase 2
  };
};

export type ActionResult<T = unknown> = { success: true; data?: T } | { error: string };

// An audit row is written inside the tenant that owns it, so every event carries the authority the
// caller already holds rather than a tenant id the logger would have to trust.
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

export type UserDomainDeps = {
  logAuditEvent?: AuditLogger;
};
