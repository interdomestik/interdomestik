import { savedDraftContinuationHref } from '@/lib/saved-draft-continuation';
import { hasIncompleteDraft } from './intake-validation';
import type { SavedDraft, SecureSaveCopy } from './types';
import type { useDraftLifecycle } from './use-draft-lifecycle';

function continuationDraft(lifecycle: ReturnType<typeof useDraftLifecycle>): SavedDraft | null {
  if (lifecycle.state !== 'saved' || lifecycle.hasUnsavedChanges || !lifecycle.active) return null;
  return isReviewReadySavedDraft(lifecycle.active) ? lifecycle.active : null;
}

export function isReviewReadySavedDraft(draft: SavedDraft): boolean {
  return (
    (draft.category === 'vehicle' || draft.category === 'property') &&
    draft.resumeStep === 'preview' &&
    !hasIncompleteDraft(draft.category, draft)
  );
}

export function SavedDraftContinuation({
  copy,
  enabled,
  lifecycle,
  locale,
}: Readonly<{
  copy: SecureSaveCopy['continuation'];
  enabled?: boolean;
  lifecycle: ReturnType<typeof useDraftLifecycle>;
  locale: string;
}>) {
  const draft = enabled ? continuationDraft(lifecycle) : null;
  if (!draft) return null;
  const href = savedDraftContinuationHref(locale, draft.id);
  if (!href) return null;
  return (
    <div className="mt-4 space-y-3" data-testid="saved-draft-continuation">
      <p id="saved-draft-continuation-description" className="text-sm text-[#365265]">
        {copy.body}
      </p>
      <a
        href={href}
        aria-describedby="saved-draft-continuation-description"
        data-testid="saved-draft-continue"
        className="inline-flex min-h-11 items-center rounded-xl bg-[#006f72] px-5 py-3 font-bold text-white focus-visible:ring-2 focus-visible:ring-[#008f91] focus-visible:ring-offset-2"
      >
        {copy.label}
      </a>
    </div>
  );
}
