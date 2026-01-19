export type SessionUser = {
  id: string;
  role?: string | null;
  name?: string | null;
  tenantId?: string | null;
};

export type Session = {
  user?: SessionUser | null;
} | null;

export type AuditEvent = {
  tenantId?: string;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  headers?: Headers;
};

export type AuditLogger = (event: AuditEvent) => void | Promise<void>;
