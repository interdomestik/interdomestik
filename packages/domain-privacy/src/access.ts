import type { DocumentAccessDecision, DocumentAccessPolicyInput } from './types';

const SENSITIVE_CLASSES = [
  'sensitive_health',
  'legal_professional_recovery',
  'financial_billing_or_recovery_cost',
] as const;

export function evaluateDocumentAccess(input: DocumentAccessPolicyInput): DocumentAccessDecision {
  const { documentPolicy, requestedPurpose, role } = input;
  const reasons: string[] = [];

  if (!documentPolicy.allowedPurposes.includes(requestedPurpose)) {
    reasons.push('purpose_not_allowed_for_document');
  }

  if (role === 'agent_promoter' && documentPolicy.sensitivity !== 'public_low') {
    reasons.push('agent_promoter_document_access_denied');
  }

  if (role === 'member' && !input.subjectOwnsDocument) {
    reasons.push('member_document_ownership_required');
  }

  if ((role === 'claims_operator' || role === 'staff') && !input.assignedToCase) {
    reasons.push('case_assignment_required');
  }

  if (role === 'medical_reviewer' && documentPolicy.sensitivity !== 'sensitive_health') {
    reasons.push('medical_reviewer_scope_mismatch');
  }

  if (role === 'lawyer' && !input.sharingConsentRecorded) {
    reasons.push('lawyer_sharing_consent_required');
  }

  if (role === 'finance' && documentPolicy.sensitivity !== 'financial_billing_or_recovery_cost') {
    reasons.push('finance_scope_mismatch');
  }

  if (role === 'admin' && !input.exceptionalAdminPurpose) {
    reasons.push('admin_exceptional_purpose_required');
  }

  if (
    documentPolicy.sensitivity === 'legal_professional_recovery' &&
    !input.professionalRecoveryAuthorized
  ) {
    reasons.push('professional_recovery_authorization_required');
  }

  return {
    kind: reasons.length > 0 ? 'blocked' : 'allowed',
    reasons,
    auditLogRequired:
      role !== 'member' || SENSITIVE_CLASSES.some(kind => kind === documentPolicy.sensitivity),
    allowedPurposes: documentPolicy.allowedPurposes,
  };
}
