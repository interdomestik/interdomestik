import type {
  AssistanceOutcome,
  AssistanceOutcomeKind,
  EscalationRecommendation,
  IncidentScenePack,
} from '../types';
import { DEFAULT_ASSISTANCE_PROVENANCE, DEFAULT_ASSISTANCE_RETENTION_POLICY } from './constants';
import { getRequiredDisclaimerCodes } from './disclaimers';
import type { CreateHelpNowIncidentScenePackInput } from './inputs';
import { createAssistanceOutcome } from './outcomes';

export function createHelpNowIncidentScenePack(
  input: CreateHelpNowIncidentScenePackInput
): IncidentScenePack {
  const outcome = createAssistanceOutcome({
    kind: helpNowOutcomeKind(input.escalationRecommendation),
    zone: 'free',
    reasons: [
      {
        code: 'help_now_free_zone_guidance',
        messageKey: 'assistance.helpNow.freeZoneGuidance',
      },
      ...(input.escalationRecommendation === 'emergency_services'
        ? [
            {
              code: 'help_now_emergency_services_recommended',
              messageKey: 'assistance.helpNow.emergencyServices',
            },
          ]
        : []),
    ],
    evidence: [
      {
        kind: 'checklist_item',
        referenceId: input.sessionId,
        summaryKey: 'assistance.helpNow.sessionDigest',
      },
    ],
    humanReviewRequired: false,
    disclaimers: getRequiredDisclaimerCodes('free'),
    provenance: input.provenance,
    piiClassification: 'none',
    createdAt: input.createdAt,
  }) as AssistanceOutcome & { zone: 'free' };

  return {
    packId: input.packId,
    packType: 'incident_scene',
    outcome,
    zone: 'free',
    inputsSummary: [
      {
        code: input.country ? `country:${input.country}` : 'country:unknown',
      },
    ],
    requiredDisclaimers: getRequiredDisclaimerCodes('free'),
    requiredHumanReview: false,
    countryRuleMetadata: [],
    piiClassification: 'none',
    retentionPolicyKey: DEFAULT_ASSISTANCE_RETENTION_POLICY,
    provenance: input.provenance ?? DEFAULT_ASSISTANCE_PROVENANCE,
    guidanceChecklist: input.guidanceChecklist,
    escalationRecommendation: input.escalationRecommendation,
  };
}

function helpNowOutcomeKind(recommendation: EscalationRecommendation): AssistanceOutcomeKind {
  if (recommendation === 'none') {
    return 'eligible';
  }

  if (recommendation === 'professional_recovery') {
    return 'requires_professional_recovery';
  }

  return 'requires_member_zone';
}
