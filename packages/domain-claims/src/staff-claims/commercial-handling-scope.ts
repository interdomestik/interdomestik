import {
  COMMERCIAL_GUIDANCE_ONLY_CATEGORIES,
  resolveCommercialLaunchScope,
} from '../claims/commercial-launch-scope';
import { getRecoveryDeclineReasonDetails } from './recovery-decision';
import type { CommercialHandlingScopeSnapshot } from './types';

const SCOPE_NOT_CONFIRMED_LABEL = 'Launch scope not confirmed';
const SCOPE_NOT_CONFIRMED_DESCRIPTION =
  'The stored claim category is missing, so keep this matter outside staff-led recovery and success-fee handling until the launch scope is confirmed.';
const SCOPE_NOT_CONFIRMED_ERROR =
  'Launch recovery scope could not be confirmed from the stored claim category, so this matter cannot move into staff-led recovery or success-fee handling.';
const LAUNCH_RECOVERY_CATEGORY_LABEL = 'Launch recovery category';
const LAUNCH_RECOVERY_CATEGORY_DESCRIPTION =
  'This claim matches the current launch recovery categories and can use staff-led recovery when the accepted-case prerequisites are ready.';
const GUIDANCE_ONLY_ERROR =
  'This matter stays guidance-only or referral-only under the current launch scope and cannot move into staff-led recovery or success-fee handling.';

export function buildCommercialHandlingScopeSnapshot(params: {
  claimCategory: string | null | undefined;
}): CommercialHandlingScopeSnapshot {
  const launchScope = resolveCommercialLaunchScope(params.claimCategory);

  if (launchScope.escalationEligible) {
    return {
      claimCategory: launchScope.claimCategory,
      decisionReason: launchScope.decisionReason,
      enforcementError: null,
      isEligible: true,
      staffDescription: LAUNCH_RECOVERY_CATEGORY_DESCRIPTION,
      staffLabel: LAUNCH_RECOVERY_CATEGORY_LABEL,
    };
  }

  if (!launchScope.claimCategory) {
    return {
      claimCategory: null,
      decisionReason: launchScope.decisionReason,
      enforcementError: SCOPE_NOT_CONFIRMED_ERROR,
      isEligible: false,
      staffDescription: SCOPE_NOT_CONFIRMED_DESCRIPTION,
      staffLabel: SCOPE_NOT_CONFIRMED_LABEL,
    };
  }

  const guidanceOnlyDetails = getRecoveryDeclineReasonDetails('guidance_only_scope');
  const enforcementError = COMMERCIAL_GUIDANCE_ONLY_CATEGORIES.has(launchScope.claimCategory)
    ? GUIDANCE_ONLY_ERROR
    : SCOPE_NOT_CONFIRMED_ERROR;
  const staffDescription = COMMERCIAL_GUIDANCE_ONLY_CATEGORIES.has(launchScope.claimCategory)
    ? guidanceOnlyDetails.memberDescription
    : `Stored claim category "${launchScope.claimCategory}" does not match the launch recovery categories, so this matter stays outside staff-led recovery and success-fee handling.`;
  const staffLabel = COMMERCIAL_GUIDANCE_ONLY_CATEGORIES.has(launchScope.claimCategory)
    ? guidanceOnlyDetails.staffLabel
    : SCOPE_NOT_CONFIRMED_LABEL;

  return {
    claimCategory: launchScope.claimCategory,
    decisionReason: launchScope.decisionReason,
    enforcementError,
    isEligible: false,
    staffDescription,
    staffLabel,
  };
}

export function resolveCommercialHandlingScopeGate(params: {
  claimCategory: string | null | undefined;
  fallbackError: string;
}): {
  error: string | null;
  scope: CommercialHandlingScopeSnapshot;
} {
  const scope = buildCommercialHandlingScopeSnapshot({
    claimCategory: params.claimCategory,
  });

  return {
    error: scope.isEligible ? null : (scope.enforcementError ?? params.fallbackError),
    scope,
  };
}
