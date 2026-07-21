import type {
  DraftState,
  FreeStartCopy,
} from '@/app/[locale]/components/home/free-start-intake-shell/types';
import type { RefObject } from 'react';

export type ClaimDraftCopy = Readonly<{
  backToDetails: string;
  categoryBody: string;
  categoryContinue: string;
  categoryHeading: string;
  heading: string;
  previewBody: string;
  previewHeading: string;
  submitDisabled: string;
  submitExplanation: string;
  supporting: string;
  truth: string;
  unsupported: string;
}>;

export function parseClaimDraftCopy(value: unknown): ClaimDraftCopy {
  return JSON.parse(String(value)) as ClaimDraftCopy;
}

type Props = Readonly<{
  copy: ClaimDraftCopy;
  draft: DraftState;
  headingRef: RefObject<HTMLHeadingElement | null>;
  labels: { category: string; issue: string; outcome: string };
  tFree: FreeStartCopy;
}>;

export function DormantPreview({ copy, draft, headingRef, labels, tFree }: Props) {
  const facts = [
    [tFree('preview.categoryLabel'), labels.category],
    [tFree('preview.issueLabel'), labels.issue],
    [tFree('preview.dateLabel'), draft.incidentDate],
    [tFree('preview.counterpartyLabel'), draft.counterparty],
    [tFree('preview.outcomeLabel'), labels.outcome],
    [tFree('preview.summaryLabel'), draft.summary],
  ];

  return (
    <div
      data-testid="claim-draft-dormant-preview"
      className="space-y-6 rounded-3xl border border-[#001a33]/15 bg-[#fffdf9] p-5 sm:p-7"
    >
      <div className="space-y-2">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold text-[#001a33] outline-none"
        >
          {copy.previewHeading}
        </h3>
        <p className="text-[#526274]">{copy.previewBody}</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#001a33]/10 bg-white p-3">
            <dt className="text-xs font-bold uppercase tracking-wide text-[#526274]">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-[#001a33]">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-2xl border border-[#006f72]/30 bg-[#eaf5f2] p-4 font-semibold leading-6 text-[#173b43]">
        {copy.truth}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-sm text-right">
          <button
            type="button"
            disabled
            data-testid="claim-draft-submit-disabled"
            aria-describedby="claim-draft-submit-explanation"
            className="min-h-12 cursor-not-allowed rounded-xl bg-slate-300 px-5 font-bold text-slate-700"
          >
            {copy.submitDisabled}
          </button>
          <p id="claim-draft-submit-explanation" className="mt-2 text-sm text-[#526274]">
            {copy.submitExplanation}
          </p>
        </div>
      </div>
    </div>
  );
}
