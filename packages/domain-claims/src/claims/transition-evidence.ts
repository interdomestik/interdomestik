import type { ClaimStatus } from '@interdomestik/database/constants';
import type {
  claimTransitionEvidenceStatuses,
  claimTransitionEvidenceTypes,
} from '@interdomestik/database/schema';

export type TransitionEvidenceType = (typeof claimTransitionEvidenceTypes)[number];
export type TransitionEvidenceStatus = (typeof claimTransitionEvidenceStatuses)[number];

export type TransitionEvidenceProof = {
  evidenceStatus: TransitionEvidenceStatus;
  evidenceType: TransitionEvidenceType;
  id: string;
};

export type TransitionEvidenceSummary = {
  evidenceCount: number;
  evidenceIds: readonly string[];
};

export type TransitionEvidenceRejectionReason =
  | 'assignment_or_poa_required'
  | 'accepted_fee_required'
  | 'airline_submission_consent_required'
  | 'valuation_delta_required'
  | 'service_consent_required'
  | 'medical_consent_required'
  | 'human_review_required';

const VEHICLE_DAMAGE_CATEGORIES = new Set(['vehicle', 'vehicle_damage', 'car_damage']);
const MEDICAL_CATEGORIES = new Set(['injury', 'invalidity']);
const MEDICAL_PROOF_TARGET_STATUSES = new Set<ClaimStatus>([
  'submitted_to_airline',
  'negotiation',
  'court',
  'resolved',
]);

type EvidenceReadParams = {
  claimCategory?: string | null;
  toStatus: ClaimStatus;
};

type EvalParams = EvidenceReadParams & {
  acceptedFeeEvidence: boolean;
  proofs: readonly TransitionEvidenceProof[];
};

function hasProof(
  proofs: readonly TransitionEvidenceProof[],
  evidenceType: TransitionEvidenceType,
  evidenceStatus: TransitionEvidenceStatus
): boolean {
  return proofs.some(
    proof => proof.evidenceType === evidenceType && proof.evidenceStatus === evidenceStatus
  );
}

function hasAssignmentOrPoa(proofs: readonly TransitionEvidenceProof[]): boolean {
  return (
    hasProof(proofs, 'assignment_signed', 'signed') || hasProof(proofs, 'poa_signed', 'signed')
  );
}

function normalizedClaimCategory(claimCategory: string | null | undefined): string {
  return claimCategory?.trim().toLowerCase() ?? '';
}

function needsMedicalProof(params: EvidenceReadParams): boolean {
  return (
    MEDICAL_PROOF_TARGET_STATUSES.has(params.toStatus) &&
    MEDICAL_CATEGORIES.has(normalizedClaimCategory(params.claimCategory))
  );
}

function needsVehicleDamageProof(params: EvidenceReadParams): boolean {
  return (
    params.toStatus === 'negotiation' &&
    VEHICLE_DAMAGE_CATEGORIES.has(normalizedClaimCategory(params.claimCategory))
  );
}

export function needsTransitionEvidenceRead(params: EvidenceReadParams): boolean {
  return (
    params.toStatus === 'submitted_to_airline' ||
    needsVehicleDamageProof(params) ||
    needsMedicalProof(params)
  );
}

export function evidenceSummary(
  proofs: readonly TransitionEvidenceProof[]
): TransitionEvidenceSummary {
  return {
    evidenceCount: proofs.length,
    evidenceIds: proofs.map(proof => proof.id).sort((left, right) => left.localeCompare(right)),
  };
}

function evaluateAirlineSubmissionEvidence(
  params: EvalParams
): TransitionEvidenceRejectionReason | null {
  const { proofs, toStatus } = params;
  if (toStatus !== 'submitted_to_airline') return null;

  if (!hasAssignmentOrPoa(proofs)) return 'assignment_or_poa_required';
  if (!params.acceptedFeeEvidence) return 'accepted_fee_required';
  if (!hasProof(proofs, 'airline_submission_consent', 'accepted')) {
    return 'airline_submission_consent_required';
  }

  return null;
}

function evaluateVehicleDamageEvidence(
  params: EvalParams
): TransitionEvidenceRejectionReason | null {
  if (!needsVehicleDamageProof(params)) return null;

  if (!hasProof(params.proofs, 'vehicle_valuation_delta', 'reviewed')) {
    return 'valuation_delta_required';
  }
  if (!hasProof(params.proofs, 'service_consent', 'signed')) return 'service_consent_required';

  return null;
}

function evaluateMedicalEvidence(params: EvalParams): TransitionEvidenceRejectionReason | null {
  if (!needsMedicalProof(params)) return null;

  if (!hasProof(params.proofs, 'medical_consent', 'accepted')) return 'medical_consent_required';
  if (
    normalizedClaimCategory(params.claimCategory) === 'invalidity' &&
    !hasProof(params.proofs, 'human_review', 'reviewed')
  ) {
    return 'human_review_required';
  }

  return null;
}

export function evaluateTransitionEvidence(
  params: EvalParams
): TransitionEvidenceRejectionReason | null {
  return (
    evaluateAirlineSubmissionEvidence(params) ??
    evaluateVehicleDamageEvidence(params) ??
    evaluateMedicalEvidence(params)
  );
}
