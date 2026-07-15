import { ArrowLeft, ArrowRight } from 'lucide-react';

import { OrganizerFields } from './organizer-fields';
import { PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from './organizer-styles';
import type { DraftState, FreeStartCopy, IssueId, SetDraftField } from './types';

type Props = Readonly<{
  draft: DraftState;
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
      <OrganizerFields {...props} />
      <label className="block space-y-2 text-base font-semibold text-[#001a33]">
        <span>{props.t('details.summary')}</span>
        <textarea
          aria-label={props.t('details.summary')}
          value={props.draft.summary}
          onChange={event => props.setDraftField('summary', event.target.value)}
          placeholder={props.t('details.summaryPlaceholder')}
          rows={5}
          className="w-full rounded-2xl border border-[#001a33]/25 bg-white px-4 py-3 text-base leading-7 text-[#001a33] outline-none transition placeholder:text-[#6d7a88] focus-visible:border-[#008f91] focus-visible:ring-3 focus-visible:ring-[#008f91]/25"
        />
      </label>
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
