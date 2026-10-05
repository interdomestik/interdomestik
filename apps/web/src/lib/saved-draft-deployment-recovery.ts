import { savedDraftContinuationHref } from './saved-draft-continuation';
import type { ClaimStartHandoffContext } from '@interdomestik/domain-claims/claims/types';

/** Next 16.3.6 reports the action-not-found response as E715 before any action executes. */
export function isOutdatedServerAction(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'UnrecognizedActionError' &&
    (error as Error & { __NEXT_ERROR_CODE?: string }).__NEXT_ERROR_CODE === 'E715'
  );
}

export function savedDraftRecoveryHref(
  locale: string,
  id: string,
  context?: ClaimStartHandoffContext
): string | null {
  const base = savedDraftContinuationHref(locale, id);
  if (!base) return null;
  if (
    !context ||
    context.source !== 'diaspora-green-card' ||
    context.incidentLocation !== 'abroad' ||
    !['DE', 'CH', 'AT', 'IT'].includes(context.country)
  )
    return base;
  const url = new URL(base, 'https://internal.invalid');
  // The existing diaspora green-card handoff is vehicle-only; this restores its review intent,
  // while the resumed owner-scoped saved draft and server writer still validate the actual facts.
  url.searchParams.set('category', 'vehicle');
  url.searchParams.set('source', context.source);
  url.searchParams.set('country', context.country);
  url.searchParams.set('incidentLocation', context.incidentLocation);
  return `${url.pathname}${url.search}${url.hash}`;
}
