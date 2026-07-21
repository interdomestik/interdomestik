import { CATEGORY_CONFIG } from '@/app/[locale]/components/home/free-start-intake-shell/constants';
import { DetailsStep } from '@/app/[locale]/components/home/free-start-intake-shell/details-step';
import type {
  FreeStartCopy,
  IssueId,
} from '@/app/[locale]/components/home/free-start-intake-shell/types';
import type { useOrganizerFlow } from '@/app/[locale]/components/home/free-start-intake-shell/use-organizer-flow';

import { DormantPreview, type ClaimDraftCopy } from './dormant-preview';

type Props = Readonly<{
  copy: ClaimDraftCopy;
  flow: ReturnType<typeof useOrganizerFlow>;
  issueIds: ReadonlyArray<IssueId>;
  labels: { category: string; issue: string; outcome: string };
  tFree: FreeStartCopy;
}>;

const ACTION_CLASS =
  'inline-flex min-h-12 items-center justify-center rounded-xl bg-[#006b7b] px-5 py-3 font-bold text-white focus-visible:ring-3 focus-visible:ring-[#008f91] disabled:opacity-60';

export function ClaimDraftMainPanel({ copy, flow, issueIds, labels, tFree }: Props) {
  if (flow.step === 'preview' || flow.step === 'complete') {
    return (
      <div className="space-y-4">
        <DormantPreview
          copy={copy}
          draft={flow.draft}
          headingRef={flow.stageHeadingRef}
          labels={labels}
          tFree={tFree}
        />
        <button
          type="button"
          onClick={() => flow.navigate('details')}
          className="min-h-11 rounded-xl border border-[#001a33]/30 bg-white px-4 font-bold text-[#001a33]"
        >
          {copy.backToDetails}
        </button>
      </div>
    );
  }

  const categoryStep = flow.step === 'category';
  return (
    <div
      data-testid="claim-draft-main-panel"
      className="space-y-6 rounded-3xl border border-[#001a33]/15 bg-[#fffdf9] p-5 sm:p-7"
    >
      <div className="space-y-2">
        <h3
          ref={flow.stageHeadingRef}
          tabIndex={-1}
          className="text-2xl font-bold text-[#001a33] outline-none"
        >
          {categoryStep ? copy.categoryHeading : tFree('details.heading')}
        </h3>
        <p className="text-[#526274]">{categoryStep ? copy.categoryBody : tFree('details.body')}</p>
      </div>
      {categoryStep ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {CATEGORY_CONFIG.map(category => {
              const disabled = category.id === 'injury';
              const selected = flow.selectedCategory === category.id;
              const Icon = category.icon;
              return (
                <button
                  key={category.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  data-testid={`claim-draft-category-${category.id}`}
                  onClick={() => flow.selectCategory(category.id)}
                  className={`min-h-32 rounded-2xl border p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] ${selected ? 'border-[#008f91] bg-[#e2f2ef]' : 'border-[#001a33]/20 bg-white'} ${disabled ? 'cursor-not-allowed opacity-55' : ''}`}
                >
                  <Icon aria-hidden="true" className="mb-3 h-6 w-6 text-[#008f91]" />
                  <span className="block font-bold">
                    {tFree(`categories.${category.id}.title`)}
                  </span>
                  <span className="mt-1 block text-sm text-[#526274]">
                    {tFree(`categories.${category.id}.examples`)}
                  </span>
                  {disabled ? (
                    <span className="mt-2 block text-xs font-bold">{copy.unsupported}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="claim-draft-category-continue"
              className={ACTION_CLASS}
              onClick={() => flow.moveToDetails(tFree('validation.chooseCategory'))}
            >
              {copy.categoryContinue}
            </button>
          </div>
        </>
      ) : null}
      {flow.step === 'details' && flow.selectedCategory ? (
        <DetailsStep
          draft={flow.draft}
          issueIds={issueIds}
          selectedCategory={flow.selectedCategory}
          setDraftField={flow.setDraftField}
          t={tFree}
          onBack={() => flow.navigate('category')}
          onContinue={() => flow.moveToPreview(tFree('validation.completeIntake'))}
        />
      ) : null}
    </div>
  );
}
