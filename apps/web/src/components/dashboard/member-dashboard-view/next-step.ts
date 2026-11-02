import { resolveClaimActionKind } from './hero-resolver';
import { type NextStepModel } from './next-step-card';
import type { DashboardClaim, DashboardTranslator } from './types';

// prettier-ignore
export function getNextStep(params: { activeClaim: DashboardClaim | null; hasClaims: boolean; isActive: boolean; locale: string; t: DashboardTranslator }): NextStepModel {
  const { activeClaim, hasClaims, isActive, locale, t } = params;

  if (!isActive) {
    return makeNextStep(
      t,
      'activate',
      `/${locale}/member/membership`,
      'next-step-activate-membership'
    );
  }

  if (!hasClaims) {
    return makeNextStep(
      t,
      'firstCase',
      `/${locale}/member/claims/new`,
      'next-step-open-first-case'
    );
  }

  if (!activeClaim) {
    return makeNextStep(t, 'history', `/${locale}/member/claims`);
  }

  const actionKind = resolveClaimActionKind(activeClaim);

  if (actionKind === 'missing_documents') {
    const uploadAction = activeClaim.nextMemberAction;
    return makeNextStep(
      t,
      'missingDocs',
      uploadAction?.href ?? `/${locale}/member/claims/${activeClaim.id}`,
      'next-step-missingDocs',
      uploadAction?.label
    );
  }

  if (actionKind === 'authorization_needed') {
    return makeNextStep(t, 'authorization', `/${locale}/member/claims/${activeClaim.id}`);
  }

  if (actionKind === 'member_action' && activeClaim.nextMemberAction) {
    return makeNextStep(
      t,
      'memberAction',
      activeClaim.nextMemberAction.href,
      'next-step-memberAction',
      activeClaim.nextMemberAction.label
    );
  }

  return makeNextStep(t, 'review', `/${locale}/member/claims/${activeClaim.id}`);
}

export function makeNextStep(
  t: DashboardTranslator,
  key: string,
  href: string,
  testId = `next-step-${key}`,
  label?: string
) {
  return {
    body: t(`nextStep.${key}.body`),
    href,
    label: label ?? t(`nextStep.${key}.cta`),
    testId,
    title: t(`nextStep.${key}.title`),
  };
}
