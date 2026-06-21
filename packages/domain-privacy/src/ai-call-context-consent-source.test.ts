import { describe, expect, it } from 'vitest';

import { mintAICallContext } from './ai-call-context-mint';
import { createDocumentExtractionMintInput } from './ai-call-context-test-helpers';

describe('AI call context consent source hardening', () => {
  it.each([
    [
      'generic consent event source',
      createDocumentExtractionMintInput({ aiConsentSourceSurface: 'terms-and-privacy' }),
      'consent_evidence_missing',
    ],
    [
      'generic document policy source',
      createDocumentExtractionMintInput({ documentPolicySourceSurface: 'privacy-policy' }),
      'consent_evidence_missing',
    ],
    [
      'generic secondary consent source',
      createDocumentExtractionMintInput({ medicalConsentSourceSurface: 'terms-of-service' }),
      'medical_document_processing_consent_missing',
    ],
  ])('rejects %s as AI extraction evidence', (_label, input, expectedReason) => {
    const decision = mintAICallContext(input);

    expect(decision.kind).toBe('missing_consent');
    expect(decision.reasons).toContain(expectedReason);
  });
});
