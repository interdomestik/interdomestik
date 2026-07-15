'use client';

import type { ClaimPack } from '@interdomestik/domain-claims/claim-pack';
import { AlertTriangle, Copy, Download } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { ResultCopy } from './result-copy';

const ACTION_CLASS =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#001a33]/30 bg-white px-4 py-2 text-base font-bold text-[#001a33] outline-none transition [overflow-wrap:anywhere] hover:border-[#008f91] focus-visible:ring-3 focus-visible:ring-[#008f91] focus-visible:ring-offset-2 motion-reduce:transition-none forced-colors:outline lg:w-auto';

export function LetterSection({
  letter,
  t,
}: Readonly<{ letter: ClaimPack['letter']; t: ResultCopy }>) {
  const [copyStatus, setCopyStatus] = useState('');
  const [copyError, setCopyError] = useState('');

  const handleCopy = useCallback(async () => {
    setCopyError('');
    setCopyStatus('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(letter.body);
      setCopyStatus(t('letter.copied'));
    } catch {
      setCopyError(t('letter.copyError'));
    }
  }, [letter.body, t]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([letter.body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'complaint-letter.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  }, [letter.body]);

  return (
    <section
      data-testid="claim-pack-letter"
      aria-labelledby="claim-pack-letter-heading"
      className="space-y-6 border-t border-[#001a33]/15 bg-[#f7f2e9] px-5 py-8 sm:px-8 lg:px-10 lg:py-10"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <h4 id="claim-pack-letter-heading" className="text-2xl font-bold text-[#001a33]">
            {t('letter.heading')}
          </h4>
          <p className="text-base leading-7 text-[#405267]">{t('letter.helper')}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row">
          <button type="button" onClick={handleCopy} className={ACTION_CLASS}>
            <Copy aria-hidden="true" className="h-4 w-4" />
            {t('letter.copy')}
          </button>
          <button type="button" onClick={handleDownload} className={ACTION_CLASS}>
            <Download aria-hidden="true" className="h-4 w-4" />
            {t('letter.download')}
          </button>
        </div>
      </div>
      {letter.placeholders.length > 0 ? (
        <p className="flex items-start gap-2 text-base leading-7 text-[#704700]">
          <AlertTriangle aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" />
          <span>
            {t('letter.placeholders')} <code>{letter.placeholders.join(', ')}</code>
          </span>
        </p>
      ) : null}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {copyStatus}
      </p>
      {copyError ? (
        <p
          role="alert"
          className="rounded-xl border border-[#a63d50] bg-[#fff0f2] p-4 text-base text-[#7f2436]"
        >
          {copyError}
        </p>
      ) : null}
      <pre className="whitespace-pre-wrap rounded-2xl border border-[#001a33]/15 bg-white p-5 font-sans text-base leading-7 text-[#1f3347] [overflow-wrap:anywhere] sm:p-6">
        {letter.body}
      </pre>
    </section>
  );
}
