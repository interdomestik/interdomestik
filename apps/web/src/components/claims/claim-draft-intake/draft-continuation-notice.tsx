import type { SecureSaveCopy } from '@/app/[locale]/components/home/free-start-intake-shell/types';
import { useEffect, useRef } from 'react';
import type { useDraftContinuation } from './use-draft-continuation';

export function DraftContinuationNotice({
  continuation,
  copy,
  locale,
}: Readonly<{
  continuation: ReturnType<typeof useDraftContinuation>;
  copy: SecureSaveCopy['continuation'];
  locale: string;
}>) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = continuation.state === 'error';
  useEffect(() => {
    if (failed) errorRef.current?.focus();
  }, [failed]);
  if (continuation.state === 'initial') return null;
  return (
    <div data-testid="draft-continuation-notice" className="space-y-4 rounded-xl border p-5">
      {failed ? (
        <p ref={errorRef} role="alert" tabIndex={-1}>
          {copy.failed}
        </p>
      ) : (
        <p role="status">{copy.loading}</p>
      )}
      {failed && continuation.canRetry ? (
        <button
          type="button"
          onClick={() => void continuation.retry()}
          className="min-h-11 rounded-xl bg-[#006f72] px-5 font-bold text-white"
        >
          {copy.retry}
        </button>
      ) : null}
      {failed ? (
        <a
          className="inline-flex min-h-11 items-center underline"
          href={`/${locale}/member/claims/new?mode=drafts`}
        >
          {copy.back}
        </a>
      ) : null}
    </div>
  );
}
