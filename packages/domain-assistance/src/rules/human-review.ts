import type { AssistanceOutcome, AssistanceServiceZone } from '../types';
import { getRequiredDisclaimerCodes } from './disclaimers';
import type { CreateInvalidityReviewBoundaryOutcomeInput } from './inputs';
import { createAssistanceOutcome } from './outcomes';

export function isInvalidityCoefficientReviewAllowed(
  zone: AssistanceServiceZone
): zone is 'member' {
  return zone === 'member';
}

export function createInvalidityReviewBoundaryOutcome(
  input: CreateInvalidityReviewBoundaryOutcomeInput
): AssistanceOutcome {
  if (!isInvalidityCoefficientReviewAllowed(input.zone)) {
    return createAssistanceOutcome({
      kind: 'requires_member_zone',
      zone: input.zone,
      reasons: [
        ...(input.reasons ?? []),
        {
          code: 'invalidity_review_member_zone_only',
          messageKey: 'assistance.invalidity.memberZoneOnly',
        },
      ],
      evidence: input.evidence,
      humanReviewRequired: true,
      disclaimers: getRequiredDisclaimerCodes(input.zone),
      provenance: input.provenance,
      piiClassification: 'medical_sensitive',
      createdAt: input.createdAt,
    });
  }

  return createAssistanceOutcome({
    kind: 'manual_review_required',
    zone: 'member',
    reasons: [
      ...(input.reasons ?? []),
      {
        code: 'invalidity_review_human_review_required',
        messageKey: 'assistance.invalidity.humanReviewRequired',
      },
    ],
    evidence: input.evidence,
    humanReviewRequired: true,
    disclaimers: getRequiredDisclaimerCodes('member'),
    provenance: input.provenance,
    piiClassification: 'medical_sensitive',
    createdAt: input.createdAt,
  });
}
