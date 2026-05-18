import type {
  DataSubjectRequestContract,
  DataSubjectRequestType,
  DocumentSensitivityClass,
  PrivacyScope,
} from './types';

const RESPONSE_DEADLINE_DAYS = 30;

export function createDataSubjectRequestContract(input: {
  requestType: DataSubjectRequestType;
  tenantId: string;
  subjectId: string;
  submittedAt: string;
  verified: boolean;
  scope?: PrivacyScope;
  legalHoldApplies?: boolean;
  reasons?: readonly string[];
}): DataSubjectRequestContract {
  const submittedAt = new Date(input.submittedAt);
  if (!Number.isFinite(submittedAt.getTime())) {
    throw new Error('invalid_submitted_at');
  }

  const responseDueAt = new Date(submittedAt);
  responseDueAt.setUTCDate(responseDueAt.getUTCDate() + RESPONSE_DEADLINE_DAYS);

  return {
    requestType: input.requestType,
    tenantId: input.tenantId,
    subjectId: input.subjectId,
    scope: input.scope,
    status: input.verified ? 'processing' : 'pending_verification',
    submittedAt: input.submittedAt,
    responseDueAt: responseDueAt.toISOString(),
    legalHoldApplies: input.legalHoldApplies ?? false,
    reasons: input.reasons ?? [],
  };
}

export function isDpiaRequiredForProcessing(input: {
  sensitivities: readonly DocumentSensitivityClass[];
  usesAiExtraction: boolean;
  includesProfessionalRecovery: boolean;
}): boolean {
  return (
    input.usesAiExtraction ||
    input.includesProfessionalRecovery ||
    input.sensitivities.includes('sensitive_health') ||
    input.sensitivities.includes('legal_professional_recovery')
  );
}
