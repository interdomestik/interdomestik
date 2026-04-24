/**
 * Public API for the claim-pack module.
 */

export { generateClaimPack } from './generator';
export { calculateConfidence } from './confidence';
export { getEvidenceChecklist } from './evidence-checklist';
export { generateLetter } from './letter-template';
export { estimateTimeline } from './timeline';
export { CLAIM_PACK_TYPES } from './types';
export type {
  ClaimPack,
  ClaimPackInput,
  ClaimPackType,
  ConfidenceResult,
  ConfidenceLevel,
  ConfidenceFactor,
  EvidenceChecklist,
  EvidenceItem,
  ComplaintLetter,
  ClaimTimeline,
  TimelineMilestone,
  RecommendedNextStep,
  IntakeAnswers,
  VehicleIntakeAnswers,
  PropertyIntakeAnswers,
  InjuryIntakeAnswers,
  CommonIntakeAnswers,
} from './types';
