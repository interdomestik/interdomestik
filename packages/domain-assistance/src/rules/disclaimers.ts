import type { AssistanceDisclaimerCode, AssistanceServiceZone } from '../types';

const FREE_ZONE_DISCLAIMERS = [
  'not_legal_advice',
  'not_medical_advice',
  'not_insurer_assessment',
  'not_professional_opinion',
  'educational_only',
] as const satisfies readonly AssistanceDisclaimerCode[];

const MEMBER_ZONE_DISCLAIMERS = [
  'not_legal_advice',
  'not_medical_advice',
  'not_insurer_assessment',
  'not_professional_opinion',
  'educational_only',
  'professional_review_required',
] as const satisfies readonly AssistanceDisclaimerCode[];

const PROFESSIONAL_RECOVERY_DISCLAIMERS = [
  'professional_review_required',
] as const satisfies readonly AssistanceDisclaimerCode[];

export function getRequiredDisclaimerCodes(
  zone: AssistanceServiceZone
): readonly AssistanceDisclaimerCode[] {
  if (zone === 'free') {
    return FREE_ZONE_DISCLAIMERS;
  }

  if (zone === 'member') {
    return MEMBER_ZONE_DISCLAIMERS;
  }

  return PROFESSIONAL_RECOVERY_DISCLAIMERS;
}
