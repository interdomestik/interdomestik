import type { FreeStartDraftRow } from '../schema/free-start-drafts';

export type FreeStartDraftCategory = 'vehicle' | 'property';
export type FreeStartDraftResumeStep = 'category' | 'details' | 'preview';
export type FreeStartDraftIssue =
  | 'collision'
  | 'theft'
  | 'parking_damage'
  | 'insurer_delay'
  | 'water_damage'
  | 'storm_fire'
  | 'burglary'
  | 'landlord_dispute';
export type FreeStartDraftOutcome =
  'repair' | 'reimbursement' | 'compensation' | 'written_response';

export type FreeStartDraftFacts = {
  category: FreeStartDraftCategory;
  counterparty: string | null;
  desiredOutcome: FreeStartDraftOutcome | null;
  incidentDate: string | null;
  issueType: FreeStartDraftIssue | null;
  resumeStep: FreeStartDraftResumeStep;
  summary: string | null;
};

export type FreeStartDraft = Omit<
  FreeStartDraftFacts,
  'counterparty' | 'desiredOutcome' | 'incidentDate' | 'issueType' | 'summary'
> & {
  clientRequestId: string;
  counterparty: string;
  createdAt: string;
  id: string;
  incidentDate: string;
  issueType: FreeStartDraftIssue | '';
  desiredOutcome: FreeStartDraftOutcome | '';
  summary: string;
  updatedAt: string;
  version: number;
};

export type FreeStartDraftContext = {
  accessTenantId: string;
  actorRole?: string | null;
  ownerUserId: string;
  tenantId: string;
};

export type CreateFreeStartDraftInput = FreeStartDraftFacts & { clientRequestId: string };
export type UpdateFreeStartDraftInput = FreeStartDraftFacts & {
  expectedVersion: number;
  id: string;
};
export type DeleteFreeStartDraftInput = { expectedVersion: number; id: string };
export type FreeStartDraftCursor = { id: string; updatedAt: string };
export type ListFreeStartDraftOptions = { cursor?: FreeStartDraftCursor | null; limit?: number };

export type CreateFreeStartDraftResult =
  { ok: true; draft: FreeStartDraft; idempotent: boolean } | { ok: false; code: 'limitReached' };
export type ReadFreeStartDraftResult =
  { ok: true; draft: FreeStartDraft } | { ok: false; code: 'notFound' };
export type UpdateFreeStartDraftResult =
  | { ok: true; draft: FreeStartDraft }
  | { ok: false; code: 'conflict'; latestVersion: number }
  | { ok: false; code: 'notFound' };
export type DeleteFreeStartDraftResult =
  | { ok: true; id: string; version: number }
  | { ok: false; code: 'conflict'; latestVersion: number }
  | { ok: false; code: 'notFound' };

export function draftValues(input: FreeStartDraftFacts) {
  return {
    category: input.category,
    counterparty: input.counterparty || null,
    desiredOutcome: input.desiredOutcome || null,
    incidentDate: input.incidentDate || null,
    issueType: input.issueType || null,
    resumeStep: input.resumeStep,
    summary: input.summary || null,
  };
}

export function toFreeStartDraft(row: FreeStartDraftRow): FreeStartDraft {
  return {
    category: row.category as FreeStartDraftCategory,
    clientRequestId: row.clientRequestId,
    counterparty: row.counterparty ?? '',
    createdAt: row.createdAt.toISOString(),
    desiredOutcome: (row.desiredOutcome as FreeStartDraftOutcome | null) ?? '',
    id: row.id,
    incidentDate: row.incidentDate ?? '',
    issueType: (row.issueType as FreeStartDraftIssue | null) ?? '',
    resumeStep: row.resumeStep as FreeStartDraftResumeStep,
    summary: row.summary ?? '',
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}
