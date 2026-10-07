'use client';

import { useTranslations } from 'next-intl';
import { parseSecureSaveCopy, parseSecureSaveReviewCopy } from './types';
import type { useDraftLifecycle } from './use-draft-lifecycle';

/** Ordinary acknowledgments announce quietly and never move focus away from the editor. */
export function AccountDraftStatus({
  lifecycle,
  locale,
}: Readonly<{
  lifecycle: ReturnType<typeof useDraftLifecycle>;
  locale: string;
}>) {
  const t = useTranslations('freeStart');
  if (!lifecycle.verified) return null;
  const copy = parseSecureSaveCopy(t.raw('secureSave'));
  const review = parseSecureSaveReviewCopy(t.raw('secureSaveReviewCopy'));
  const state = lifecycle.state;
  const failed = [
    'conflict',
    'limit',
    'invalid',
    'unsupported',
    'accountContext',
    'error',
  ].includes(state);
  let statusMessage = copy.status[state] ?? '';
  if (state === 'invalid' || state === 'unsupported' || state === 'accountContext') {
    statusMessage = review[state];
  } else if (state === 'idle') {
    statusMessage = t('accountDraft.ready');
  }
  const message = statusMessage.replace(
    '{date}',
    lifecycle.active ? new Date(lifecycle.active.updatedAt).toLocaleString(locale) : ''
  );
  return (
    <div
      data-testid="account-draft-status"
      data-state={state}
      className="rounded-xl border border-current/20 p-3 text-sm"
    >
      <p>{t('accountDraft.body')}</p>
      <p
        role={failed ? 'alert' : 'status'}
        aria-live={failed ? undefined : 'polite'}
        aria-atomic="true"
      >
        {message}
      </p>
      {state === 'error' || state === 'dirty' || state === 'limit' ? (
        <button type="button" onClick={lifecycle.saveChanges} className="min-h-11 underline">
          {copy.saveChanges}
        </button>
      ) : null}
      {lifecycle.items.length > 0 ? (
        <button
          type="button"
          disabled={state === 'loading'}
          onClick={lifecycle.openManage}
          className="ml-3 min-h-11 underline"
        >
          {copy.manage.open}
        </button>
      ) : null}
    </div>
  );
}
