// T-404 compile-fail fixture: every @ts-expect-error below must stay a type
// error so public domain-ai call entry points cannot silently drop context.
import { createAiClient } from './client';
import { extractClaimIntake } from './claims/intake-extract';
import { summarizeClaim } from './claims/summary';
import type { DomainAiCallContext } from './context';
import { extractLegalDocument } from './legal/extract';

// @ts-expect-error T-403b: structural AI call context cannot be forged outside domain-privacy.
export const forgedContext: DomainAiCallContext = {
  workflowId: 'claim_intake_extract',
  owner: 'domain-ai-test',
  tenantId: 'tenant-1',
  actorId: 'user-1',
  subjectId: 'user-1',
  scope: { claimId: 'claim-1', documentId: 'document-1' },
  purpose: 'document_extraction',
  processingPurpose: 'ai_document_extraction',
  retention: 'zero_retention_no_training',
  posture: 'human_review_required',
  consent: 'required_granted',
  invalidityPosture: 'not_applicable',
};

// @ts-expect-error T-404: AI client construction requires trusted AICallContext.
createAiClient();

// @ts-expect-error T-404: claim intake extraction requires trusted AICallContext.
extractClaimIntake({
  claim: {
    title: 'Flight cancellation reimbursement',
    description: null,
    category: 'travel',
    claimAmount: null,
    currency: null,
  },
});

// @ts-expect-error T-404: claim summary requires trusted AICallContext.
summarizeClaim({
  claim: {
    title: 'Delayed baggage claim',
    description: null,
    category: 'travel',
    companyName: null,
    claimAmount: null,
    currency: null,
  },
});

// @ts-expect-error T-404: legal extraction requires trusted AICallContext.
extractLegalDocument({ documentText: 'Demand letter issued by Contoso Legal.' });
