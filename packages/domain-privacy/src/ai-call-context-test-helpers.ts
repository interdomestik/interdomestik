import type { AICallContextFields } from './ai';
import { mintAICallContext, type AICallContextMintInput } from './ai-call-context-mint';

export function mintRequired(input: AICallContextMintInput) {
  const decision = mintAICallContext(input);
  if (decision.kind !== 'valid') throw new Error(decision.reasons.join(','));
  return decision.context;
}

export function withAcceptedConsent(input: AICallContextFields): AICallContextMintInput {
  return {
    ...input,
    consentEvidence: {
      consentEvents: [
        {
          id: 'consent_1',
          tenantId: input.tenantId,
          actorId: input.actorId,
          subjectId: input.subjectId ?? input.actorId,
          scope: input.scope,
          consentType: 'ai_document_extraction',
          purpose: input.processingPurpose,
          lawfulBasis: 'consent',
          privacyVersion: 'privacy-v1',
          locale: 'en',
          status: 'accepted',
          recordedAt: '2026-06-21T00:00:00.000Z',
          sourceSurface: 'domain-privacy-test',
        },
      ],
    },
  };
}
