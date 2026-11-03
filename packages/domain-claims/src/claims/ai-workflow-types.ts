export type ClaimAiWorkflow = 'claim_intake_extract' | 'legal_doc_extract';

export type ClaimAiDocumentCategory = 'evidence' | 'legal';

export type ClaimAiFileInput = {
  documentId?: string;
  name: string;
  path: string;
  type: string;
  size: number;
  bucket: string;
  category?: string | null;
};

export type ClaimAiClaimSnapshot = {
  title: string;
  description?: string | null;
  category: string;
  companyName: string;
  claimAmount?: string | null;
  currency?: string | null;
  incidentDate?: string | null;
};

export type QueuedClaimAiRun = {
  runId: string;
  /** Tenant the run was queued under; the worker binds every run lookup to it. */
  tenantId: string;
  workflow: ClaimAiWorkflow;
  claimId: string;
  documentId: string;
};

export type ClaimAiConsentGrant = {
  consentEventId: string;
  recordedAt: string;
};

export type ClaimAiWorkflowQueueInput = {
  tx: unknown;
  claimId: string;
  tenantId: string;
  userId: string;
  files: ClaimAiFileInput[];
  claimSnapshot?: ClaimAiClaimSnapshot | null;
};
