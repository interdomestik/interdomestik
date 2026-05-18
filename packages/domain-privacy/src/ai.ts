import { evaluateConsentRequirement } from './consent';
import type { AiExtractionDecision, AiExtractionPolicyInput, ConsentType } from './types';

export function evaluateAiExtractionPolicy(input: AiExtractionPolicyInput): AiExtractionDecision {
  const reasons: string[] = [];
  const requiredConsentTypes: ConsentType[] = [...input.documentPolicy.requiredConsentTypes];

  if (!input.documentPolicy.aiExtractionAllowed) {
    reasons.push('ai_extraction_not_allowed_for_document');
  }

  if (!input.noTraining) {
    reasons.push('ai_no_training_required');
  }

  if (!input.zeroRetention) {
    reasons.push('ai_zero_retention_required');
  }

  if (!requiredConsentTypes.includes('ai_document_extraction')) {
    requiredConsentTypes.push('ai_document_extraction');
  }

  for (const consentType of requiredConsentTypes) {
    const decision = evaluateConsentRequirement(input.consentEvents, {
      tenantId: input.tenantId,
      subjectId: input.subjectId,
      consentType,
      purpose:
        consentType === 'ai_document_extraction'
          ? 'ai_document_extraction'
          : input.requestedPurpose,
      scope: input.scope,
      documentSensitivity: input.documentPolicy.sensitivity,
      requiresArticle9Basis: input.documentPolicy.sensitivity === 'sensitive_health',
      requiredArticle9Basis:
        consentType === 'medical_document_processing' ? 'explicit_consent' : undefined,
    });

    if (decision.kind === 'blocked') {
      reasons.push(`${consentType}_${decision.reasons[0]}`);
    }
  }

  return {
    kind: reasons.length > 0 ? 'blocked' : 'allowed',
    reasons,
    finalDecisionAllowed: false,
    humanReviewRequired:
      input.documentPolicy.requiresHumanReview || input.documentPolicy.sensitivity !== 'public_low',
    requiredConsentTypes,
    audit: {
      workflow: input.workflow,
      modelBoundary: input.modelBoundary,
      noTraining: input.noTraining,
      zeroRetention: input.zeroRetention,
      promptOrSchemaVersion: input.promptOrSchemaVersion,
      sensitivity: input.documentPolicy.sensitivity,
    },
  };
}
