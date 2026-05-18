export const PRIVACY_ZONES = [
  'free_self_service',
  'member_assistance',
  'professional_recovery',
] as const;

export type PrivacyZone = (typeof PRIVACY_ZONES)[number];

export const CONSENT_EVENT_STATUSES = ['accepted', 'declined', 'withdrawn'] as const;

export type ConsentEventStatus = (typeof CONSENT_EVENT_STATUSES)[number];

export const CONSENT_TYPES = [
  'membership_terms',
  'privacy_policy',
  'case_opening',
  'document_upload_processing',
  'medical_document_processing',
  'ai_document_extraction',
  'share_with_insurer',
  'share_with_bureau',
  'share_with_expert',
  'share_with_lawyer',
  'professional_recovery_authorization',
  'service_agreement',
  'power_of_attorney',
  'expert_cost_approval',
  'court_escalation',
  'billing_and_success_fee_processing',
  'data_export_request',
  'data_erasure_request',
] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];

export const PROCESSING_PURPOSES = [
  'preliminary_self_service_check',
  'missing_document_check',
  'case_opening',
  'document_storage',
  'staff_triage',
  'ai_document_extraction',
  'injury_category_precheck',
  'vehicle_damage_precheck',
  'invalidity_review',
  'professional_recovery',
  'insurer_sharing',
  'bureau_sharing',
  'expert_sharing',
  'lawyer_sharing',
  'court_escalation',
  'billing_and_success_fee',
  'data_export',
  'data_erasure',
] as const;

export type ProcessingPurpose = (typeof PROCESSING_PURPOSES)[number];

export const DOCUMENT_SENSITIVITY_CLASSES = [
  'public_low',
  'personal',
  'sensitive_health',
  'legal_professional_recovery',
  'financial_billing_or_recovery_cost',
] as const;

export type DocumentSensitivityClass = (typeof DOCUMENT_SENSITIVITY_CLASSES)[number];

export const RECIPIENT_CLASSES = [
  'interdomestik_internal',
  'insurer',
  'bureau',
  'expert',
  'lawyer',
  'court',
  'finance',
] as const;

export type RecipientClass = (typeof RECIPIENT_CLASSES)[number];

export const PRIVACY_ROLES = [
  'member',
  'ai_extraction_service',
  'claims_operator',
  'staff',
  'medical_reviewer',
  'lawyer',
  'agent_promoter',
  'admin',
  'finance',
] as const;

export type PrivacyRole = (typeof PRIVACY_ROLES)[number];

export const LAWFUL_BASIS_MARKERS = [
  'consent',
  'contract',
  'legal_obligation',
  'vital_interests',
  'public_interest',
  'legitimate_interest',
  'legal_claims',
] as const;

export type LawfulBasisMarker = (typeof LAWFUL_BASIS_MARKERS)[number];

export const ARTICLE_9_MARKERS = [
  'explicit_consent',
  'legal_claims',
  'health_professional',
  'not_applicable',
] as const;

export type Article9Marker = (typeof ARTICLE_9_MARKERS)[number];

export interface PrivacyScope {
  caseId?: string;
  claimId?: string;
  assistanceSessionId?: string;
  documentId?: string;
}

export interface ConsentEvent {
  id: string;
  tenantId: string;
  actorId: string;
  subjectId: string;
  scope?: PrivacyScope;
  consentType: ConsentType;
  purpose: ProcessingPurpose;
  documentSensitivity?: DocumentSensitivityClass;
  recipientClass?: RecipientClass;
  lawfulBasis: LawfulBasisMarker;
  article9Basis?: Article9Marker;
  termsVersion?: string;
  privacyVersion: string;
  locale: string;
  status: ConsentEventStatus;
  recordedAt: string;
  acceptedAt?: string;
  declinedAt?: string;
  withdrawnAt?: string;
  sourceSurface: string;
  ipHash?: string;
  deviceSessionProof?: string;
  evidenceSnapshotRef?: string;
  supersedesEventId?: string;
}

export interface ConsentRequirement {
  tenantId: string;
  subjectId: string;
  consentType: ConsentType;
  purpose: ProcessingPurpose;
  scope?: PrivacyScope;
  documentSensitivity?: DocumentSensitivityClass;
  recipientClass?: RecipientClass;
  requiresArticle9Basis?: boolean;
  requiredArticle9Basis?: Article9Marker;
}

export type ConsentDecisionKind = 'allowed' | 'blocked';

export interface ConsentDecision {
  kind: ConsentDecisionKind;
  consentEvent?: ConsentEvent;
  reasons: readonly string[];
  requiresExplicitConsent: boolean;
}

export interface DocumentProcessingPolicy {
  sensitivity: DocumentSensitivityClass;
  sourceUploadSurface: string;
  allowedPurposes: readonly ProcessingPurpose[];
  allowedRecipientClasses: readonly RecipientClass[];
  requiredConsentTypes: readonly ConsentType[];
  retentionPolicyKey: string;
  requiresHumanReview: boolean;
  aiExtractionAllowed: boolean;
  redactionRequired: boolean;
  accessPolicyId: string;
}

export interface DocumentPolicyInput {
  sensitivity: DocumentSensitivityClass;
  sourceUploadSurface: string;
  allowedPurposes?: readonly ProcessingPurpose[];
  allowedRecipientClasses?: readonly RecipientClass[];
}

export type AccessDecisionKind = 'allowed' | 'blocked';

export interface DocumentAccessDecision {
  kind: AccessDecisionKind;
  reasons: readonly string[];
  auditLogRequired: boolean;
  allowedPurposes: readonly ProcessingPurpose[];
}

export interface DocumentAccessPolicyInput {
  role: PrivacyRole;
  subjectOwnsDocument?: boolean;
  assignedToCase?: boolean;
  exceptionalAdminPurpose?: string;
  professionalRecoveryAuthorized?: boolean;
  sharingConsentRecorded?: boolean;
  requestedPurpose: ProcessingPurpose;
  documentPolicy: DocumentProcessingPolicy;
}

export interface AiExtractionPolicyInput {
  tenantId: string;
  subjectId: string;
  workflow: string;
  modelBoundary: string;
  noTraining: boolean;
  zeroRetention: boolean;
  promptOrSchemaVersion: string;
  requestedPurpose: ProcessingPurpose;
  scope: PrivacyScope;
  documentPolicy: DocumentProcessingPolicy;
  consentEvents: readonly ConsentEvent[];
}

export interface AiExtractionDecision {
  kind: 'allowed' | 'blocked';
  reasons: readonly string[];
  finalDecisionAllowed: false;
  humanReviewRequired: boolean;
  requiredConsentTypes: readonly ConsentType[];
  audit: {
    workflow: string;
    modelBoundary: string;
    noTraining: boolean;
    zeroRetention: boolean;
    promptOrSchemaVersion: string;
    sensitivity: DocumentSensitivityClass;
  };
}

export const DATA_SUBJECT_REQUEST_TYPES = [
  'access',
  'rectification',
  'erasure',
  'restriction',
  'portability',
  'objection',
  'withdrawal',
] as const;

export type DataSubjectRequestType = (typeof DATA_SUBJECT_REQUEST_TYPES)[number];

export interface DataSubjectRequestContract {
  requestType: DataSubjectRequestType;
  tenantId: string;
  subjectId: string;
  scope?: PrivacyScope;
  status: 'pending_verification' | 'processing' | 'fulfilled' | 'rejected';
  submittedAt: string;
  responseDueAt: string;
  legalHoldApplies: boolean;
  reasons: readonly string[];
}
