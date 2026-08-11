import type {
  DraftState,
  FreeStartCopy,
} from '@/app/[locale]/components/home/free-start-intake-shell/types';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { isSavedDraftId, useSavedDraftClaim } from './use-saved-draft-claim';
// prettier-ignore
export type ClaimDraftCopy = Readonly<{ backToDetails: string; categoryBody: string; categoryContinue: string; categoryHeading: string; existingCaseSuccess: string; heading: string; previewBody: string; previewHeading: string; submitDisabled: string; submitExplanation: string; supporting: string; truth: string; unsupported: string }>;
export function parseClaimDraftCopy(value: unknown): ClaimDraftCopy {
  return JSON.parse(String(value)) as ClaimDraftCopy;
}
// prettier-ignore
export type SavedDraftSubmitCopy = Readonly<{ failed: string; goToClaim: string; goToClaims: string; label: string; success: string; unexpected: string }>;
// prettier-ignore
type Props = Readonly<{ activeDraftId?: string | null; activeDraftVersion?: number | null; copy: ClaimDraftCopy; draft: DraftState; hasUnsavedChanges?: boolean; headingRef: RefObject<HTMLHeadingElement | null>; labels: { category: string; issue: string; outcome: string }; managerOnly?: boolean; submitCopy: SavedDraftSubmitCopy; tFree: FreeStartCopy }>;
export function DormantPreview(props: Props) {
  // prettier-ignore
  const { activeDraftId, activeDraftVersion, copy, draft, hasUnsavedChanges, headingRef, labels, managerOnly, submitCopy, tFree } = props;
  const failureRef = useRef<HTMLParagraphElement>(null);
  const successRef = useRef<HTMLOutputElement>(null);
  const locale = useLocale();
  // prettier-ignore
  const facts = [[tFree('preview.categoryLabel'), labels.category], [tFree('preview.issueLabel'), labels.issue], [tFree('preview.dateLabel'), draft.incidentDate], [tFree('preview.counterpartyLabel'), draft.counterparty], [tFree('preview.outcomeLabel'), labels.outcome], [tFree('preview.summaryLabel'), draft.summary]];
  // prettier-ignore
  const eligible = Boolean(!managerOnly && isSavedDraftId(activeDraftId) && activeDraftVersion && !hasUnsavedChanges && [draft.issueType, draft.incidentDate, draft.counterparty, draft.desiredOutcome, draft.summary].every(value => value.trim()));
  const { claim, failure, lookupStatus, origin, pending, submit } = useSavedDraftClaim({
    draftId: activeDraftId,
    draftVersion: activeDraftVersion,
    eligible,
    failedCopy: submitCopy.failed,
    unexpectedCopy: submitCopy.unexpected,
  });
  // prettier-ignore
  useEffect(() => { if (failure) failureRef.current?.focus(); else if (claim && origin === 'user_submit') successRef.current?.focus(); }, [failure, claim, origin]);
  let submitAction: ReactNode;
  if (claim) {
    submitAction = (
      <output
        ref={successRef}
        data-testid="claim-created-success"
        data-claim-number={claim.number}
        tabIndex={-1}
        className="block space-y-3 text-left"
      >
        <span className="block font-bold text-[#173b43]">
          {origin === 'background_lookup' ? copy.existingCaseSuccess : submitCopy.success}
        </span>
        <Link
          className="font-bold text-[#006b7b] underline"
          href={`/${locale}/member/claims/${claim.id}`}
        >
          {submitCopy.goToClaim}
        </Link>
      </output>
    );
  } else if (eligible) {
    submitAction = (
      <button
        type="button"
        data-testid="claim-draft-submit"
        disabled={pending || lookupStatus === 'checking'}
        aria-busy={pending || lookupStatus === 'checking'}
        onClick={submit}
        className="min-h-12 rounded-xl bg-[#006b7b] px-5 font-bold text-white disabled:opacity-60"
      >
        {submitCopy.label}
      </button>
    );
  } else {
    submitAction = (
      <button
        type="button"
        disabled
        data-testid="claim-draft-submit-disabled"
        aria-describedby="claim-draft-submit-explanation"
        className="min-h-12 cursor-not-allowed rounded-xl bg-slate-300 px-5 font-bold text-slate-700"
      >
        {copy.submitDisabled}
      </button>
    );
  }
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
      {!claim && !eligible ? (
        <div className="rounded-2xl border border-[#006f72]/30 bg-[#eaf5f2] p-4 font-semibold leading-6 text-[#173b43]">
          {copy.truth}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-sm text-right">
          {submitAction}
          {!claim && !eligible ? (
            <p id="claim-draft-submit-explanation" className="mt-2 text-sm text-[#526274]">
              {copy.submitExplanation}
            </p>
          ) : null}
          {failure ? (
            <p
              ref={failureRef}
              role="alert"
              tabIndex={-1}
              className="mt-2 rounded-lg bg-rose-50 p-2 text-sm font-semibold text-rose-900 outline-none"
            >
              {failure}{' '}
              <Link className="underline" href={`/${locale}/member/claims`}>
                {submitCopy.goToClaims}
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
