'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { parseSecureSaveCopy, type SavedDraft } from './types';

type Props = Readonly<{
  draft: SavedDraft;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function DeleteDraftConfirmation({ draft, onCancel, onConfirm }: Props) {
  const t = useTranslations('freeStart');
  const locale = useLocale();
  const copy = parseSecureSaveCopy(t.raw('secureSave'));
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      open
      tabIndex={-1}
      onKeyDown={event => event.key === 'Escape' && onCancel()}
      aria-labelledby="free-start-delete-heading"
      aria-describedby="free-start-delete-body"
      className="m-0 max-w-none rounded-2xl border-2 border-[#9a4051] bg-[#fff7f8] p-5 text-inherit outline-none focus-visible:ring-3 focus-visible:ring-[#9a4051]"
    >
      <h5 id="free-start-delete-heading" className="text-lg font-bold text-[#6f2636]">
        {copy.delete.heading}
      </h5>
      <p id="free-start-delete-body" className="mt-2 text-sm leading-6 text-[#5c3a42]">
        {copy.delete.body.replace('{date}', new Date(draft.updatedAt).toLocaleDateString(locale))}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="free-start-delete-confirm"
          onClick={onConfirm}
          className="min-h-11 rounded-xl bg-[#8a2f43] px-5 text-base font-bold text-white outline-none focus-visible:ring-3 focus-visible:ring-[#8a2f43] focus-visible:ring-offset-2"
        >
          {copy.delete.confirm}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-[#001a33]/25 px-5 text-base font-bold outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
        >
          {copy.delete.cancel}
        </button>
      </div>
    </dialog>
  );
}
