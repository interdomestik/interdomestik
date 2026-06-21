import {
  mintClaimDocumentAiCallContext,
  resolveClaimDocumentAiExtractionConsent,
} from '@interdomestik/domain-claims';

import { db } from '@/lib/db.server';

import { ExtractionPipelineError } from './extraction-pipeline';
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
    throw new ExtractionPipelineError(
      'claim_ai_context_required',
      `AI call context is required: ${consent.reason}`
    );
  }

  try {
    return mintClaimDocumentAiCallContext({
      claimId: run.claimId,
      documentId: run.documentId,
      grant: consent.grant,
      tenantId: run.tenantId,
      userId: run.requestedBy,
      subjectId: run.subjectId,
      workflow: run.workflow,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI call context is invalid.';
    throw new ExtractionPipelineError('claim_ai_context_invalid', message);
  }
}
