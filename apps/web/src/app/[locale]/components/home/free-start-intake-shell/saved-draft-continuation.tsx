import { savedDraftContinuationHref } from '@/lib/saved-draft-continuation';
import type { SecureSaveCopy } from './types';

export function SavedDraftContinuation({
  copy,
  id,
  locale,
}: Readonly<{
  copy: SecureSaveCopy['continuation'];
  id: string;
  locale: string;
}>) {
  const href = savedDraftContinuationHref(locale, id);
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
