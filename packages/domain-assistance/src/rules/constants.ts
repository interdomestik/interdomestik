import type {
  AssistanceProvenance,
  ProfessionalRecoveryActivationRole,
  ProfessionalRecoveryState,
} from '../types';

export const AI_FINAL_DECISION_ALLOWED = false;

export const PROFESSIONAL_RECOVERY_STATE_SEQUENCE = [
  'requested',
  'authorization_pending',
  'agreement_pending',
  'consent_recorded',
  'professional_review_pending',
  'active_recovery',
  'settlement_or_resolution_pending',
  'closed',
] as const satisfies readonly ProfessionalRecoveryState[];

export const PROFESSIONAL_RECOVERY_ACTIVATION_RIGHTS = {
  member: ['requested', 'consent_recorded'],
  staff: ['authorization_pending', 'agreement_pending', 'professional_review_pending'],
  authorized_professional: ['active_recovery', 'settlement_or_resolution_pending', 'closed'],
  finance_or_operations: ['settlement_or_resolution_pending', 'closed'],
} as const satisfies Record<
  ProfessionalRecoveryActivationRole,
  readonly ProfessionalRecoveryState[]
>;

export const DEFAULT_ASSISTANCE_RETENTION_POLICY = 'help_now_free_zone_aggregate_v1';

export const DEFAULT_ASSISTANCE_PROVENANCE: AssistanceProvenance = {
  source: 'rules',
  generatedBy: 'domain-assistance',
};
