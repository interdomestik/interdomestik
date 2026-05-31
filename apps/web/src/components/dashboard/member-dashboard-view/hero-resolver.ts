import type { DashboardClaim } from './types';

export type MemberHomeHeroState =
  | 'visitor_general'
  | 'visitor_broker_tpl'
  | 'visitor_diaspora'
  | 'member_active_no_case'
  | 'member_active_has_open_case'
  | 'missing_documents'
  | 'authorization_needed'
  | 'member_action';

export type VisitorHeroVariant = Extract<
  MemberHomeHeroState,
  'visitor_general' | 'visitor_broker_tpl' | 'visitor_diaspora'
>;

export type MemberHomeHeroModel = {
  ariaLabelKey?: `heroResolver.states.member_action.actions.${GenericMemberActionType}.ariaLabel`;
  copyKey: `heroResolver.states.${MemberHomeHeroState}`;
  ctaKey?:
    | `heroResolver.states.${MemberHomeHeroState}.cta`
    | `heroResolver.states.member_action.actions.${GenericMemberActionType}.cta`;
  href: string;
  primaryTestId: string;
  state: MemberHomeHeroState;
  translationValues?: {
    claimReference: string;
  };
};

export type ClaimActionKind =
  | 'missing_documents'
  | 'authorization_needed'
  | 'member_action'
  | 'open_case';

type ResolveMemberHomeHeroParams = {
  activeClaim: DashboardClaim | null;
  isActive: boolean;
  locale: string;
  visitorVariant?: VisitorHeroVariant;
};

const AUTHORIZATION_STAGE_PATTERN = /authorization|authorisation|autoriz/i;

type MemberAction = NonNullable<DashboardClaim['nextMemberAction']>;
type GenericMemberActionType = Exclude<MemberAction['actionType'], 'upload_document'>;

const MEMBER_ACTION_CTA_KEYS: Record<
  GenericMemberActionType,
  `heroResolver.states.member_action.actions.${GenericMemberActionType}.cta`
> = {
  provide_info: 'heroResolver.states.member_action.actions.provide_info.cta',
  review_offer: 'heroResolver.states.member_action.actions.review_offer.cta',
};

const MEMBER_ACTION_ARIA_LABEL_KEYS: Record<
  GenericMemberActionType,
  `heroResolver.states.member_action.actions.${GenericMemberActionType}.ariaLabel`
> = {
  provide_info: 'heroResolver.states.member_action.actions.provide_info.ariaLabel',
  review_offer: 'heroResolver.states.member_action.actions.review_offer.ariaLabel',
};

export function isAuthorizationStage(stageKey: string): boolean {
  return AUTHORIZATION_STAGE_PATTERN.test(stageKey);
}

function isGenericMemberActionType(
  actionType: MemberAction['actionType']
): actionType is GenericMemberActionType {
  return actionType === 'provide_info' || actionType === 'review_offer';
}

export function resolveClaimActionKind(activeClaim: DashboardClaim): ClaimActionKind {
  if (
    activeClaim.requiresMemberAction &&
    activeClaim.nextMemberAction?.actionType === 'upload_document'
  ) {
    return 'missing_documents';
  }

  if (isAuthorizationStage(activeClaim.stageKey)) {
    return 'authorization_needed';
  }

  if (activeClaim.requiresMemberAction && activeClaim.nextMemberAction) {
    return 'member_action';
  }

  return 'open_case';
}

export function resolveMemberHomeHero({
  activeClaim,
  isActive,
  locale,
  visitorVariant = 'visitor_general',
}: ResolveMemberHomeHeroParams): MemberHomeHeroModel {
  if (!isActive) {
    return {
      copyKey: `heroResolver.states.${visitorVariant}`,
      href: `/${locale}/member/membership`,
      primaryTestId: `hero-cta-${visitorVariant}`,
      state: visitorVariant,
    };
  }

  if (!activeClaim) {
    return {
      copyKey: 'heroResolver.states.member_active_no_case',
      href: `/${locale}/member/claims/new`,
      primaryTestId: 'hero-cta-open-first-case',
      state: 'member_active_no_case',
    };
  }

  const actionKind = resolveClaimActionKind(activeClaim);

  if (actionKind === 'missing_documents') {
    const uploadAction = activeClaim.nextMemberAction;
    return {
      copyKey: 'heroResolver.states.missing_documents',
      href: uploadAction?.href ?? `/${locale}/member/claims/${activeClaim.id}`,
      primaryTestId: 'hero-cta-upload-documents',
      state: 'missing_documents',
    };
  }

  if (actionKind === 'authorization_needed') {
    return {
      copyKey: 'heroResolver.states.authorization_needed',
      href: `/${locale}/member/claims/${activeClaim.id}`,
      primaryTestId: 'hero-cta-sign-authorization',
      state: 'authorization_needed',
    };
  }

  if (actionKind === 'member_action' && activeClaim.nextMemberAction) {
    const actionType = activeClaim.nextMemberAction.actionType;

    if (isGenericMemberActionType(actionType)) {
      return {
        ariaLabelKey: MEMBER_ACTION_ARIA_LABEL_KEYS[actionType],
        copyKey: 'heroResolver.states.member_action',
        ctaKey: MEMBER_ACTION_CTA_KEYS[actionType],
        href: activeClaim.nextMemberAction.href,
        primaryTestId: 'hero-cta-member-action',
        state: 'member_action',
        translationValues: {
          claimReference: activeClaim.claimNumber ?? activeClaim.id,
        },
      };
    }
  }

  return {
    copyKey: 'heroResolver.states.member_active_has_open_case',
    href: `/${locale}/member/claims/${activeClaim.id}`,
    primaryTestId: 'hero-cta-open-active-case',
    state: 'member_active_has_open_case',
  };
}
