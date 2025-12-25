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
