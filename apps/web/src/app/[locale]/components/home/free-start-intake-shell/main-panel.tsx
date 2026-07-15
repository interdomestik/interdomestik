import type { RefObject } from 'react';

import { CategoryStep } from './category-step';
import { DetailsStep } from './details-step';
import { PreviewStep } from './preview-step';
import type {
  CategoryId,
  DraftState,
  FreeStartCopy,
  IssueId,
  SetDraftField,
  StepId,
} from './types';

type Props = Readonly<{
  categoryLabel: string;
  draft: DraftState;
  headingRef: RefObject<HTMLHeadingElement | null>;
  issueIds: ReadonlyArray<IssueId>;
  issueLabel: string;
  isFinishing: boolean;
  outcomeLabel: string;
  selectedCategory: CategoryId | null;
  setDraftField: SetDraftField;
  step: StepId;
  t: FreeStartCopy;
  onBackToCategory: () => void;
  onBackToDetails: () => void;
  onCategorySelect: (category: CategoryId) => void;
  onFinish: () => void;
  onMoveToDetails: () => void;
  onMoveToPreview: () => void;
}>;

export function FreeStartMainPanel(props: Props) {
  const contentStep = props.step === 'complete' ? 'preview' : props.step;
  const titleKey = contentStep === 'category' ? 'choose.heading' : `${contentStep}.heading`;
  const bodyKey = contentStep === 'category' ? 'choose.body' : `${contentStep}.body`;

  return (
    <div className="space-y-6">
      {props.selectedCategory && props.step === 'details' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#001a33]/15 pb-4">
          <p className="text-sm text-[#526274]">
            {props.t('selectedSituation.label')}{' '}
            <strong className="text-[#001a33]">{props.categoryLabel}</strong>
          </p>
          <button
            type="button"
            onClick={props.onBackToCategory}
            className="min-h-11 rounded-lg px-3 text-base font-bold text-[#006b7b] underline decoration-[#008f91]/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
          >
            {props.t('selectedSituation.change')}
          </button>
        </div>
      ) : null}
      <div className="space-y-2">
        <h3
          ref={props.headingRef}
          tabIndex={-1}
          className="text-2xl font-bold leading-tight text-[#001a33] outline-none sm:text-3xl"
        >
          {props.t(titleKey)}
        </h3>
        <p className="max-w-2xl text-base leading-7 text-[#526274]">{props.t(bodyKey)}</p>
      </div>
      {props.step === 'category' ? (
        <CategoryStep
          selectedCategory={props.selectedCategory}
          t={props.t}
          onContinue={props.onMoveToDetails}
          onSelect={props.onCategorySelect}
        />
      ) : null}
      {props.step === 'details' && props.selectedCategory ? (
        <DetailsStep
          draft={props.draft}
          issueIds={props.issueIds}
          selectedCategory={props.selectedCategory}
          setDraftField={props.setDraftField}
          t={props.t}
          onBack={props.onBackToCategory}
          onContinue={props.onMoveToPreview}
        />
      ) : null}
      {props.step === 'preview' || props.step === 'complete' ? (
        <PreviewStep
          categoryLabel={props.categoryLabel}
          draft={props.draft}
          issueLabel={props.issueLabel}
          isFinishing={props.isFinishing}
          outcomeLabel={props.outcomeLabel}
          step={props.step}
          t={props.t}
          onBack={props.onBackToDetails}
          onFinish={props.onFinish}
        />
      ) : null}
    </div>
  );
}
