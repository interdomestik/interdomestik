'use client';

import { resumeFreeStartDraft } from '@/actions/free-start-drafts';
import { SecureSaveOtp } from '@/app/[locale]/components/home/free-start-intake-shell/secure-save-otp';
import {
  readSavedDraftContinuation,
  savedDraftContinuationHref,
} from '@/lib/saved-draft-continuation';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export function SavedDraftSignIn({
  locale,
  tenantId,
}: Readonly<{ locale: string; tenantId: string }>) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  useEffect(() => {
    setDraftId(readSavedDraftContinuation(globalThis.location.hash));
  }, []);
  if (!draftId || searchParams.has('next')) return null;
  const href = savedDraftContinuationHref(locale, draftId);
  if (!href) return null;
  return (
    <div className="w-full max-w-md rounded-xl bg-white p-5" data-testid="saved-draft-sign-in">
      <SecureSaveOtp
        locale={locale}
        tenantId={tenantId}
        onVerified={async () => {
          // Authentication alone grants no access to this draft; recheck ownership before returning.
          const result = await resumeFreeStartDraft({ id: draftId });
          if (!result.ok) throw new Error('saved_draft_unavailable');
          globalThis.location.assign(href);
        }}
      />
    </div>
  );
}
