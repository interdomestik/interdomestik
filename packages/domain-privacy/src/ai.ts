import { evaluateConsentRequirement } from './consent';
import type {
  AiExtractionDecision,
  AiExtractionPolicyInput,
  ConsentType,
  PrivacyScope,
  ProcessingPurpose,
} from './types';

export const AI_CALL_PURPOSES = [
  'general_case',
  'document_extraction',
  'invalidity_review',
] as const;

export type AICallPurpose = (typeof AI_CALL_PURPOSES)[number];

export const AI_CALL_RETENTION_POSTURES = [
  'zero_retention_no_training',
  'transient_no_training',
] as const;

export type AICallRetentionPosture = (typeof AI_CALL_RETENTION_POSTURES)[number];

export const AI_CALL_POSTURES = ['disabled', 'advisory', 'human_review_required'] as const;

export type AICallPosture = (typeof AI_CALL_POSTURES)[number];

export const AI_CALL_CONSENT_POSTURES = ['not_required', 'required_granted'] as const;

export type AICallConsentPosture = (typeof AI_CALL_CONSENT_POSTURES)[number];

export const AI_CALL_INVALIDITY_POSTURES = [
  'not_applicable',
  'precheck_only',
  'human_review_required',
] as const;

export type AICallInvalidityPosture = (typeof AI_CALL_INVALIDITY_POSTURES)[number];

export type AICallContextInvalidReason =
  | 'context_missing'
  | 'workflow_id_missing'
  | 'owner_missing'
  | 'tenant_id_missing'
  | 'actor_id_missing'
  | 'subject_id_invalid'
  | 'scope_missing'
  | 'scope_invalid'
  | 'processing_purpose_unsupported'
  | 'processing_purpose_mismatch'
  | 'purpose_unsupported'
  | 'retention_unsupported'
  | 'posture_missing'
  | 'posture_unsupported'
  | 'consent_missing'
  | 'consent_unsupported'
  | 'invalidity_posture_missing'
  | 'invalidity_posture_unsupported'
  | 'disabled_posture_requires_general_case'
  | 'document_extraction_requires_zero_retention'
  | 'document_extraction_requires_consent'
  | 'invalidity_review_requires_human_review'
  | 'invalidity_review_requires_consent';

export interface AICallContext {
  workflowId: string;
  owner: string;
  tenantId: string;
  actorId: string;
  subjectId?: string;
  scope: PrivacyScope;
  purpose: AICallPurpose;
  processingPurpose: ProcessingPurpose;
  retention: AICallRetentionPosture;
  posture: AICallPosture;
  consent: AICallConsentPosture;
  invalidityPosture: AICallInvalidityPosture;
}

export type AICallContextValidationDecision =
  | { kind: 'valid'; context: AICallContext; reasons: readonly [] }
  | { kind: 'invalid'; reasons: readonly AICallContextInvalidReason[] };

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
