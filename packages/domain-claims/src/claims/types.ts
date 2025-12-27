export type ClaimsSession = {
  user: {
    id: string;
    role?: string | null;
    email?: string | null;
  };
};

export type ClaimsAuditEvent = {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  headers?: Headers;
};

export type ClaimsDeps = {
  logAuditEvent?: (event: ClaimsAuditEvent) => Promise<void> | void;
  notifyClaimSubmitted?: (
    userId: string,
    email: string,
    claim: { id: string; title: string; category: string }
  ) => Promise<unknown> | unknown;
  notifyStatusChanged?: (
    userId: string,
    email: string,
    claim: { id: string; title: string },
    oldStatus: string,
    newStatus: string
  ) => Promise<unknown> | unknown;
  revalidatePath?: (path: string) => Promise<void> | void;
};
