import type {
  DocumentAccessDecision,
  DocumentAccessPolicyInput,
  DocumentSensitivityClass,
} from './types';

const SENSITIVE_CLASSES = [
  'sensitive_health',
  'legal_professional_recovery',
  'financial_billing_or_recovery_cost',
] as const;

type AccessPolicyRule = {
  readonly reason: string;
  readonly isViolated: (input: DocumentAccessPolicyInput) => boolean;
};

const ACCESS_POLICY_RULES: readonly AccessPolicyRule[] = [
  {
    reason: 'purpose_not_allowed_for_document',
    isViolated: ({ documentPolicy, requestedPurpose }) =>
      !documentPolicy.allowedPurposes.includes(requestedPurpose),
  },
  {
    reason: 'agent_promoter_document_access_denied',
    isViolated: ({ documentPolicy, role }) =>
      role === 'agent_promoter' && documentPolicy.sensitivity !== 'public_low',
  },
  {
    reason: 'member_document_ownership_required',
    isViolated: ({ role, subjectOwnsDocument }) => role === 'member' && !subjectOwnsDocument,
  },
  {
    reason: 'case_assignment_required',
    isViolated: ({ assignedToCase, role }) =>
      (role === 'claims_operator' || role === 'staff') && !assignedToCase,
  },
  {
    reason: 'medical_reviewer_scope_mismatch',
    isViolated: ({ documentPolicy, role }) =>
      role === 'medical_reviewer' && documentPolicy.sensitivity !== 'sensitive_health',
  },
  {
    reason: 'lawyer_sharing_consent_required',
    isViolated: ({ role, sharingConsentRecorded }) => role === 'lawyer' && !sharingConsentRecorded,
  },
  {
    reason: 'finance_scope_mismatch',
    isViolated: ({ documentPolicy, role }) =>
      role === 'finance' && documentPolicy.sensitivity !== 'financial_billing_or_recovery_cost',
  },
  {
    reason: 'admin_exceptional_purpose_required',
    isViolated: ({ exceptionalAdminPurpose, role }) => role === 'admin' && !exceptionalAdminPurpose,
  },
  {
    reason: 'professional_recovery_authorization_required',
    isViolated: ({ documentPolicy, professionalRecoveryAuthorized }) =>
      documentPolicy.sensitivity === 'legal_professional_recovery' &&
      !professionalRecoveryAuthorized,
  },
];

function isSensitiveDocument(sensitivity: DocumentSensitivityClass): boolean {
  return (SENSITIVE_CLASSES as readonly DocumentSensitivityClass[]).includes(sensitivity);
}

function accessPolicyReasons(input: DocumentAccessPolicyInput): string[] {
  return ACCESS_POLICY_RULES.filter(rule => rule.isViolated(input)).map(rule => rule.reason);
}

export function evaluateDocumentAccess(input: DocumentAccessPolicyInput): DocumentAccessDecision {
  const { documentPolicy, role } = input;
  const reasons = accessPolicyReasons(input);

  return {
    kind: reasons.length > 0 ? 'blocked' : 'allowed',
    reasons,
    auditLogRequired: role !== 'member' || isSensitiveDocument(documentPolicy.sensitivity),
    allowedPurposes: documentPolicy.allowedPurposes,
  };
}
