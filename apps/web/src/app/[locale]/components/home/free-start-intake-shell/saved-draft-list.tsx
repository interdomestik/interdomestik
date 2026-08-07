'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { DifferentEmailRecovery } from './different-email-recovery';
import { parseSecureSaveCopy, type DraftSaveState, type SavedDraft } from './types';

type Props = Readonly<{
  items: SavedDraft[];
  nextCursor: { id: string; updatedAt: string } | null;
  onDelete: (draft: SavedDraft) => void;
  onLoadMore: () => void;
  onResume: (id: string) => void;
  state: DraftSaveState;
}>;

function isReady(draft: SavedDraft) {
  return Boolean(
    draft.issueType &&
    draft.incidentDate &&
    draft.counterparty &&
    draft.desiredOutcome &&
    draft.summary
  );
}

export function SavedDraftList(props: Props) {
  const t = useTranslations('freeStart');
  const locale = useLocale();
  const copy = parseSecureSaveCopy(t.raw('secureSave'));
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  if (props.state === 'loading' && props.items.length === 0) {
    return <p className="mt-5 text-sm text-[#526274]">{copy.manage.loading}</p>;
  }

  if (props.items.length === 0) {
    return (
      <div
        className="mt-5 rounded-2xl border border-dashed border-[#001a33]/25 bg-white p-5"
        aria-labelledby="free-start-manage-heading"
      >
        <h4
          ref={headingRef}
          id="free-start-manage-heading"
          tabIndex={-1}
          className="text-lg font-bold text-[#001a33] outline-none"
        >
          {copy.manage.heading}
        </h4>
        <p className="mt-2 font-bold text-[#001a33]">{copy.manage.emptyHeading}</p>
        <p className="mt-2 text-sm leading-6 text-[#526274]">{copy.manage.emptyBody}</p>
        <DifferentEmailRecovery />
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4" aria-labelledby="free-start-manage-heading">
      <h4
        ref={headingRef}
        id="free-start-manage-heading"
        tabIndex={-1}
        className="text-lg font-bold text-[#001a33] outline-none"
      >
        {copy.manage.heading}
      </h4>
      <ul className="space-y-3">
        {props.items.map(draft => (
          <li
            key={draft.id}
            data-testid={`free-start-draft-${draft.id}`}
            className="rounded-2xl border border-[#001a33]/15 bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-[#001a33]">
                  {t(`categories.${draft.category}.title`)}
                </p>
                <p className="mt-1 text-sm text-[#526274]">
                  {isReady(draft) ? copy.manage.ready : copy.manage.inProgress}
                  {' · '}
                  {new Date(draft.updatedAt).toLocaleDateString(locale)}
                </p>
                {draft.summary || draft.counterparty ? (
                  <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-6 text-[#33485c]">
                    {draft.summary || draft.counterparty}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid={`free-start-resume-${draft.id}`}
                  disabled={props.state === 'loading'}
                  onClick={() => props.onResume(draft.id)}
                  className="min-h-11 rounded-xl bg-[#006f72] px-4 text-sm font-bold text-white outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] focus-visible:ring-offset-2"
                >
                  {copy.manage.resume}
                </button>
                <button
                  type="button"
                  data-testid={`free-start-delete-${draft.id}`}
                  disabled={props.state === 'loading'}
                  onClick={() => props.onDelete(draft)}
                  className="min-h-11 rounded-xl border border-[#8a2f43] px-4 text-sm font-bold text-[#8a2f43] outline-none focus-visible:ring-3 focus-visible:ring-[#8a2f43]"
                >
                  {copy.manage.delete}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {props.nextCursor ? (
        <button
          type="button"
          disabled={props.state === 'loading'}
          onClick={props.onLoadMore}
          className="min-h-11 rounded-xl border border-[#006f72] px-4 text-sm font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
        >
          {copy.manage.loadMore}
        </button>
      ) : null}
      <DifferentEmailRecovery />
    </div>
  );
}
