import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

export type SessionUser = {
  branchId?: string | null;
  id: string;
  role?: string | null;
  name?: string | null;
  tenantId?: string | null;
};

export type Session = {
  user?: SessionUser | null;
} | null;

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

export type AuditLogger = (event: AuditEvent) => void | Promise<void>;
