// Shared constants that are safe to import from both server and client code.

export const CLAIM_STATUSES = [
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
  'resolved',
  'rejected',
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_CASE_LIFECYCLE_STATES = [
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'recovery',
  'resolved',
  'rejected',
] as const;

export type ClaimCaseLifecycleState = (typeof CLAIM_CASE_LIFECYCLE_STATES)[number];

export const CLAIM_RECOVERY_LIFECYCLE_STATES = [
  'not_started',
  'negotiation',
  'court',
  'resolved',
  'closed',
] as const;

export type ClaimRecoveryLifecycleState = (typeof CLAIM_RECOVERY_LIFECYCLE_STATES)[number];

export const LEAD_STAGES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];
