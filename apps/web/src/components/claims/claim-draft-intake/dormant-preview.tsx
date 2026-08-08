import type {
  DraftState,
  FreeStartCopy,
} from '@/app/[locale]/components/home/free-start-intake-shell/types';
import { createClaimFromSavedDraft } from '@/actions/claims/create-from-saved-draft';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from 'react';
// prettier-ignore
export type ClaimDraftCopy = Readonly<{ backToDetails: string; categoryBody: string; categoryContinue: string; categoryHeading: string; heading: string; previewBody: string; previewHeading: string; submitDisabled: string; submitExplanation: string; supporting: string; truth: string; unsupported: string }>;
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
  const [pending, startTransition] = useTransition();
  const [createdClaim, setCreatedClaim] = useState<{ id: string; number: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const failureRef = useRef<HTMLParagraphElement>(null);
  const submitting = useRef(false);
  const locale = useLocale();
  // prettier-ignore
  const facts = [[tFree('preview.categoryLabel'), labels.category], [tFree('preview.issueLabel'), labels.issue], [tFree('preview.dateLabel'), draft.incidentDate], [tFree('preview.counterpartyLabel'), draft.counterparty], [tFree('preview.outcomeLabel'), labels.outcome], [tFree('preview.summaryLabel'), draft.summary]];
  // prettier-ignore
  const eligible = Boolean(!managerOnly && activeDraftId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activeDraftId) && activeDraftVersion && !hasUnsavedChanges && [draft.issueType, draft.incidentDate, draft.counterparty, draft.desiredOutcome, draft.summary].every(value => value.trim()));
  // prettier-ignore
  useEffect(() => { if (failure) failureRef.current?.focus(); else if (createdClaim) document.querySelector<HTMLElement>('[data-testid="claim-created-success"]')?.focus(); }, [failure, createdClaim]);
  function submit() {
    if (!eligible || !activeDraftId || !activeDraftVersion || submitting.current) return;
    submitting.current = true;
    setFailure(null);
    startTransition(async () => {
      try {
        // prettier-ignore
        const result = await createClaimFromSavedDraft({ id: activeDraftId, expectedVersion: activeDraftVersion });
        if (result.success) setCreatedClaim({ id: result.claimId, number: result.claimNumber });
        else setFailure(submitCopy.failed);
      } catch {
        setFailure(submitCopy.unexpected);
      } finally {
        submitting.current = false;
      }
    });
  }
  let submitAction: ReactNode;
  if (createdClaim) {
    submitAction = (
      <output
        data-testid="claim-created-success"
        data-claim-number={createdClaim.number}
        tabIndex={-1}
        className="block space-y-3 text-left"
      >
        <p className="font-bold text-[#173b43]">{submitCopy.success}</p>
        <Link
          className="font-bold text-[#006b7b] underline"
          href={`/${locale}/member/claims/${createdClaim.id}`}
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
        disabled={pending}
        aria-busy={pending}
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
      {!eligible ? (
        <div className="rounded-2xl border border-[#006f72]/30 bg-[#eaf5f2] p-4 font-semibold leading-6 text-[#173b43]">
          {copy.truth}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-sm text-right">
          {submitAction}
          {!eligible ? (
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
