import type { QueuedClaimAiRun } from './ai-workflows';

export type ClaimStartHandoffContext = {
  source: 'diaspora-green-card';
  country: 'DE' | 'CH' | 'AT' | 'IT';
  incidentLocation: 'abroad';
};

export type ClaimsSession = {
  user: {
    branchId?: string | null;
    id: string;
    role?: string | null;
    tenantId?: string | null;
    email?: string | null;
  };
};

export type ClaimsAuditEvent = {
  actorId?: string | null;
  actorRole?: string | null;
  tenantId?: string | null;
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
  ) => unknown;
  notifyStatusChanged?: (
    userId: string,
    email: string,
    claim: { id: string; title: string },
    oldStatus: string,
    newStatus: string,
    options?: { tenantId?: string | null }
  ) => unknown;
  notifyClaimAssigned?: (
    agentId: string,
    email: string,
    claim: { id: string; title: string },
    agentName: string
  ) => unknown;
  notifyRecoveryDecision?: (
    userId: string,
    email: string,
    claim: { id: string; title: string },
    decisionType: 'accepted' | 'declined',
    options?: { tenantId?: string | null }
  ) => unknown;
  dispatchClaimAiRun?: (queuedRun: QueuedClaimAiRun) => Promise<void> | void;
  markClaimAiRunDispatchFailed?: (args: { runId: string; message: string }) => Promise<void> | void;
  revalidatePath?: (path: string) => Promise<void> | void;
};

export type ActionResult<T = void> =
  | { success: true; data?: T; error: undefined }
  | { success: false; error: string; data: undefined };
