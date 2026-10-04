import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { RefObject } from 'react';

import { focusFragmentTarget } from './arrival-navigation';

import { OrganizerFields } from './organizer-fields';
import { PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from './organizer-styles';
import type { DraftState, FreeStartCopy, IssueId, SetDraftField } from './types';

type Props = Readonly<{
  draft: DraftState;
  narrativeHeadingRef?: RefObject<HTMLHeadingElement | null>;
  issueIds: ReadonlyArray<IssueId>;
  selectedCategory: string;
  setDraftField: SetDraftField;
  t: FreeStartCopy;
  onBack: () => void;
  onContinue: () => void;
}>;

export function DetailsStep(props: Props) {
  return (
    <>
      {/* The narrative comes first so the problem can be described before secondary facts. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h4
            id="free-start-narrative-heading"
            ref={props.narrativeHeadingRef}
            tabIndex={-1}
            className="scroll-mt-24 text-base font-semibold text-[#001a33] outline-none"
          >
            <label htmlFor="free-start-summary">{props.t('details.summary')}</label>
          </h4>
          {props.narrativeHeadingRef &&
          (props.selectedCategory === 'vehicle' || props.selectedCategory === 'property') ? (
            <a
              href="#free-start-urgent-advice-heading"
              onClick={focusFragmentTarget}
              className="inline-flex min-h-11 items-center rounded-lg text-base font-semibold text-[#006b7b] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
            >
              {props.t('urgentAdvice.heading')}
            </a>
          ) : null}
        </div>
        <textarea
          id="free-start-summary"
          aria-label={props.t('details.summary')}
          value={props.draft.summary}
          onChange={event => props.setDraftField('summary', event.target.value)}
          placeholder={props.t('details.summaryPlaceholder')}
          rows={5}
          className="w-full rounded-2xl border border-[#001a33]/25 bg-white px-4 py-3 text-base leading-7 text-[#001a33] outline-none transition placeholder:text-[#6d7a88] focus-visible:border-[#008f91] focus-visible:ring-3 focus-visible:ring-[#008f91]/25"
        />
      </div>
      <OrganizerFields {...props} />
      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" onClick={props.onBack} className={SECONDARY_ACTION_CLASS}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {props.t('details.back')}
        </button>
        <button type="button" onClick={props.onContinue} className={PRIMARY_ACTION_CLASS}>
          {props.t('details.continue')}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
