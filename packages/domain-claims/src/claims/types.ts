import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

import type { QueuedClaimAiRun } from './ai-workflows';
import type { EvidenceFile } from '../validators/claims';

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
    accessTenantId?: string | null;
    email?: string | null;
  };
};

export type ClaimsAuditEvent = {
  actorId?: string | null;
  actorRole?: string | null;
  /** The authority of the tenant that owns the audited entity; the logger writes the row under it. */
  authority: TenantAuthority;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  headers?: Headers;
};

export type ClaimsDeps = {
  projectClaimStatusAuditProjection?: (args: {
    authority: TenantAuthority;
    limit?: number;
  }) => Promise<unknown> | unknown;
  validateSubmittedClaimFile?: (args: {
    actorId: string;
    file: EvidenceFile;
    tenantId: string;
  }) => Promise<void> | void;
  logAuditEvent?: (event: ClaimsAuditEvent) => Promise<void> | void;
  notifyClaimSubmitted?: (
    userId: string,
    email: string,
    claim: { id: string; title: string; category: string },
    options: { authority: TenantAuthority }
  ) => unknown;
  notifyStatusChanged?: (
    userId: string,
    email: string,
    claim: { id: string; title: string },
    oldStatus: string,
    newStatus: string,
    options: { authority: TenantAuthority }
  ) => unknown;
  notifyClaimAssigned?: (
    agentId: string,
    email: string,
    claim: { id: string; title: string },
    agentName: string,
    options: { authority: TenantAuthority }
  ) => unknown;
  notifyRecoveryDecision?: (
    userId: string,
    email: string,
    claim: { id: string; title: string },
    decisionType: 'accepted' | 'declined',
    options: { authority: TenantAuthority }
  ) => unknown;
  dispatchClaimAiRun?: (queuedRun: QueuedClaimAiRun) => Promise<void> | void;
  markClaimAiRunDispatchFailed?: (args: { runId: string; message: string }) => Promise<void>;
  revalidatePath?: (path: string) => Promise<void> | void;
};

export type ActionResult<T = void> =
  | { success: true; data?: T; error: undefined }
  | { success: false; error: string; data: undefined };
