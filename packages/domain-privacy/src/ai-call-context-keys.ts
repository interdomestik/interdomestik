export const AI_CALL_CONTEXT_KEYS = [
  'workflowId',
  'owner',
  'tenantId',
  'actorId',
  'subjectId',
  'scope',
  'purpose',
  'processingPurpose',
  'retention',
  'posture',
  'consent',
  'invalidityPosture',
] as const;

export const PRIVACY_SCOPE_KEYS = [
  'caseId',
  'claimId',
  'assistanceSessionId',
  'documentId',
] as const;
