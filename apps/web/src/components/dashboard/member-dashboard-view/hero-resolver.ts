import type { DashboardClaim } from './types';

export type MemberHomeHeroState =
  | 'visitor_general'
  | 'visitor_broker_tpl'
  | 'visitor_diaspora'
  | 'member_active_no_case'
  | 'member_active_has_open_case'
  | 'missing_documents'
  | 'authorization_needed';

export type VisitorHeroVariant = Extract<
  MemberHomeHeroState,
  'visitor_general' | 'visitor_broker_tpl' | 'visitor_diaspora'
>;

export type MemberHomeHeroModel = {
  copyKey: `heroResolver.states.${MemberHomeHeroState}`;
  href: string;
  primaryTestId: string;
  state: MemberHomeHeroState;
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

export function isAuthorizationStage(stageKey: string): boolean {
  return AUTHORIZATION_STAGE_PATTERN.test(stageKey);
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

  return {
    copyKey: 'heroResolver.states.member_active_has_open_case',
    href: `/${locale}/member/claims/${activeClaim.id}`,
    primaryTestId: 'hero-cta-open-active-case',
    state: 'member_active_has_open_case',
  };
}
