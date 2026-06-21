import {
  mintClaimDocumentAiCallContext,
  resolveClaimDocumentAiExtractionConsent,
} from '@interdomestik/domain-claims';

import { db } from '@/lib/db.server';

import type { ClaimedClaimAiRun } from './claim-pipeline-run';

export async function readClaimPipelineAiCallContext(run: ClaimedClaimAiRun) {
  const consent = await resolveClaimDocumentAiExtractionConsent({
    tx: db,
    tenantId: run.tenantId,
    subjectId: run.subjectId,
    claimId: run.claimId,
    documentId: run.documentId,
  });

  if (consent.kind !== 'granted') {
    throw new Error(`AI call context is required: ${consent.reason}`);
  }

  return mintClaimDocumentAiCallContext({
    claimId: run.claimId,
    documentId: run.documentId,
    grant: consent.grant,
    tenantId: run.tenantId,
    userId: run.requestedBy,
    subjectId: run.subjectId,
    workflow: run.workflow,
  });
}
