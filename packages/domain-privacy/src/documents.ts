import type {
  DocumentPolicyInput,
  DocumentProcessingPolicy,
  DocumentSensitivityClass,
  ProcessingPurpose,
  RecipientClass,
} from './types';

const DEFAULT_POLICIES: Record<DocumentSensitivityClass, DocumentProcessingPolicy> = {
  public_low: {
    sensitivity: 'public_low',
    sourceUploadSurface: 'unspecified',
    allowedPurposes: ['preliminary_self_service_check', 'missing_document_check'],
    allowedRecipientClasses: ['interdomestik_internal'],
    requiredConsentTypes: ['document_upload_processing'],
    retentionPolicyKey: 'short_case_orientation',
    requiresHumanReview: false,
    aiExtractionAllowed: true,
    redactionRequired: false,
    accessPolicyId: 'document.public_low.v1',
  },
  personal: {
    sensitivity: 'personal',
    sourceUploadSurface: 'unspecified',
    allowedPurposes: ['case_opening', 'document_storage', 'staff_triage'],
    allowedRecipientClasses: ['interdomestik_internal', 'insurer', 'bureau'],
    requiredConsentTypes: ['document_upload_processing'],
    retentionPolicyKey: 'case_document_standard',
    requiresHumanReview: false,
    aiExtractionAllowed: true,
    redactionRequired: false,
    accessPolicyId: 'document.personal.v1',
  },
  sensitive_health: {
    sensitivity: 'sensitive_health',
    sourceUploadSurface: 'unspecified',
    allowedPurposes: ['injury_category_precheck', 'invalidity_review', 'ai_document_extraction'],
    allowedRecipientClasses: ['interdomestik_internal', 'expert', 'lawyer'],
    requiredConsentTypes: ['medical_document_processing', 'ai_document_extraction'],
    retentionPolicyKey: 'sensitive_health_case_document',
    requiresHumanReview: true,
    aiExtractionAllowed: true,
    redactionRequired: true,
    accessPolicyId: 'document.sensitive_health.v1',
  },
  legal_professional_recovery: {
    sensitivity: 'legal_professional_recovery',
    sourceUploadSurface: 'unspecified',
    allowedPurposes: ['professional_recovery', 'lawyer_sharing', 'court_escalation'],
    allowedRecipientClasses: ['interdomestik_internal', 'lawyer', 'court'],
    requiredConsentTypes: [
      'professional_recovery_authorization',
      'service_agreement',
      'power_of_attorney',
    ],
    retentionPolicyKey: 'professional_recovery_legal_hold',
    requiresHumanReview: true,
    aiExtractionAllowed: false,
    redactionRequired: true,
    accessPolicyId: 'document.legal_professional_recovery.v1',
  },
  financial_billing_or_recovery_cost: {
    sensitivity: 'financial_billing_or_recovery_cost',
    sourceUploadSurface: 'unspecified',
    allowedPurposes: ['billing_and_success_fee', 'professional_recovery'],
    allowedRecipientClasses: ['interdomestik_internal', 'finance'],
    requiredConsentTypes: ['billing_and_success_fee_processing'],
    retentionPolicyKey: 'legal_accounting_hold',
    requiresHumanReview: true,
    aiExtractionAllowed: false,
    redactionRequired: false,
    accessPolicyId: 'document.financial_billing_or_recovery_cost.v1',
  },
};

function mergeUnique<T extends string>(base: readonly T[], override?: readonly T[]): readonly T[] {
  if (!override) {
    return base;
  }

  return [...new Set([...base, ...override])];
}

export function getDefaultDocumentProcessingPolicy(
  sensitivity: DocumentSensitivityClass
): DocumentProcessingPolicy {
  return DEFAULT_POLICIES[sensitivity];
}

export function createDocumentProcessingPolicy(
  input: DocumentPolicyInput
): DocumentProcessingPolicy {
  const base = getDefaultDocumentProcessingPolicy(input.sensitivity);

  return {
    ...base,
    sourceUploadSurface: input.sourceUploadSurface,
    allowedPurposes: mergeUnique<ProcessingPurpose>(base.allowedPurposes, input.allowedPurposes),
    allowedRecipientClasses: mergeUnique<RecipientClass>(
      base.allowedRecipientClasses,
      input.allowedRecipientClasses
    ),
  };
}
