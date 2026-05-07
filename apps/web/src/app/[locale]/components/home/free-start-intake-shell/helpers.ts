import { isPublicMembershipEntryHref } from '@/lib/public-membership-entry';

import { CATEGORY_CONFIG } from './constants';
import type {
  CategoryId,
  ConfidenceLevel,
  ContinueRouteKey,
  DraftState,
  FreeStartCopy,
  IssueId,
} from './types';

const COUNTERPARTY_DETAIL_MIN_LENGTH = 10;
const SUMMARY_DETAIL_MIN_LENGTH = 40;
const BASE_CONFIDENCE_SCORE = 1;
const HIGH_CONFIDENCE_MIN_SCORE = 5;
const MEDIUM_CONFIDENCE_MIN_SCORE = 3;

export function getIssueIds(category: CategoryId | null): ReadonlyArray<IssueId> {
  return CATEGORY_CONFIG.find(item => item.id === category)?.issueIds ?? [];
}

export function getActiveStepIndex(step: string): number {
  if (step === 'category') {
    return 0;
  }

  if (step === 'details') {
    return 1;
  }

  return 2;
}

export function getProgressStepClassName(isActive: boolean, isComplete: boolean): string {
  const baseClassName =
    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold';

  if (isActive) {
    return `${baseClassName} border-cyan-300/70 bg-cyan-300/15 text-cyan-100`;
  }

  if (isComplete) {
    return `${baseClassName} border-emerald-300/40 bg-emerald-300/10 text-emerald-100`;
  }

  return `${baseClassName} border-slate-700 bg-slate-900/80 text-slate-400`;
}

export function getCategoryCardClassName(isSelected: boolean): string {
  const baseClassName = 'flex h-full flex-col gap-4 rounded-2xl border p-4 text-left transition';

  if (isSelected) {
    return `${baseClassName} border-cyan-300 bg-cyan-300/10 text-white`;
  }

  return `${baseClassName} border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500 hover:bg-slate-900`;
}

export function getCategoryIconClassName(isSelected: boolean): string {
  const baseClassName = 'inline-flex h-11 w-11 items-center justify-center rounded-2xl';

  if (isSelected) {
    return `${baseClassName} bg-cyan-200 text-slate-950`;
  }

  return `${baseClassName} bg-slate-800 text-cyan-100`;
}

export function getSelectedIssueLabel(
  t: FreeStartCopy,
  selectedCategory: CategoryId | null,
  issueType: DraftState['issueType']
): string {
  if (selectedCategory && issueType) {
    return t(`issues.${selectedCategory}.${issueType}`);
  }

  return t('preview.notProvided');
}

export function getSelectedOutcomeLabel(
  t: FreeStartCopy,
  desiredOutcome: DraftState['desiredOutcome']
): string {
  if (desiredOutcome) {
    return t(`outcomes.${desiredOutcome}`);
  }

  return t('preview.notProvided');
}

export function getContinueLabel(t: FreeStartCopy, continueHref: string): string {
  const routeKey = getContinueRouteKey(continueHref);

  if (routeKey === 'membership') {
    return t('completion.continueMembership');
  }

  if (routeKey === 'member') {
    return t('completion.continueMember');
  }

  return t('completion.continuePortal');
}

export function getContinueRouteKey(continueHref: string): ContinueRouteKey {
  if (isPublicMembershipEntryHref(continueHref)) {
    return 'membership';
  }

  if (continueHref.startsWith('/member')) {
    return 'member';
  }

  return 'portal';
}

export function getRecommendedContinueLabel(
  t: FreeStartCopy,
  continueHref: string,
  level: Extract<ConfidenceLevel, 'high' | 'medium'>
): string {
  return t(`completion.cta.${getContinueRouteKey(continueHref)}.${level}`);
}

export function getConfidenceLevel(
  selectedCategory: CategoryId | null,
  draft: DraftState
): ConfidenceLevel {
  if (selectedCategory === null) {
    return 'low';
  }

  const hasMonetaryOutcome =
    draft.desiredOutcome !== '' && draft.desiredOutcome !== 'written_response';
  const hasDetailedCounterparty =
    draft.counterparty.trim().length >= COUNTERPARTY_DETAIL_MIN_LENGTH;
  const hasDetailedSummary = draft.summary.trim().length >= SUMMARY_DETAIL_MIN_LENGTH;
  const isGuidanceOnlyIssue = draft.issueType === 'landlord_dispute';

  if (!hasMonetaryOutcome && isGuidanceOnlyIssue) {
    return 'low';
  }

  let score = BASE_CONFIDENCE_SCORE;

  if (hasMonetaryOutcome) {
    score += 2;
  }

  if (hasDetailedCounterparty) {
    score += 1;
  }

  if (hasDetailedSummary) {
    score += 1;
  }

  if (!isGuidanceOnlyIssue) {
    score += 1;
  }

  if (score >= HIGH_CONFIDENCE_MIN_SCORE && hasMonetaryOutcome) {
    return 'high';
  }

  if (score >= MEDIUM_CONFIDENCE_MIN_SCORE) {
    return 'medium';
  }

  return 'low';
}

export function getConfidenceClassName(level: ConfidenceLevel): string {
  const baseClassName =
    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]';

  if (level === 'high') {
    return `${baseClassName} border-emerald-300/40 bg-emerald-300/10 text-emerald-100`;
  }

  if (level === 'medium') {
    return `${baseClassName} border-amber-300/40 bg-amber-300/10 text-amber-100`;
  }

  return `${baseClassName} border-rose-300/40 bg-rose-300/10 text-rose-100`;
}

export function getSelectedCategoryLabel(
  t: FreeStartCopy,
  selectedCategory: CategoryId | null
): string {
  if (selectedCategory) {
    return t(`categories.${selectedCategory}.title`);
  }

  return t('preview.notProvided');
}
