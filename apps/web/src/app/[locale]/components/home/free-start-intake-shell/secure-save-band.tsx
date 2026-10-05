'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DeleteDraftConfirmation } from './delete-draft-confirmation';
import { SavedDraftList } from './saved-draft-list';
import { SavedDraftContinuation, isSavedDraftContinuationReady } from './saved-draft-continuation';
import { isNeutralFrontDoor } from './secure-save-entry';
import { SecureSaveOtp } from './secure-save-otp';
import { SecureSaveActiveActions, SecureSavePrimaryActions } from './secure-save-actions';
import { parseSecureSaveCopy, parseSecureSaveReviewCopy, type SavedDraft } from './types';
import type { useDraftLifecycle } from './use-draft-lifecycle';

/**
 * Optional public presentation. Member and manager consumers omit it and keep the default
 * rendering; the public shell uses it to focus this heading after a deliberate opener click.
 */
export type SecureSavePresentation = Readonly<{
  autoFocusHeading: boolean;
  saveAvailable: boolean;
}>;
// prettier-ignore
type Props = Readonly<{ allowContinuation?: boolean; lifecycle: ReturnType<typeof useDraftLifecycle>; locale: string; manageOnly?: boolean; neutralOtpHost?: string | null; onVerifiedOwner?: (userId: string) => boolean; publicPresentation?: SecureSavePresentation; tenantId?: string | null }>;
// prettier-ignore
const resolveStatus = (lifecycle: ReturnType<typeof useDraftLifecycle>, locale: string, copy: ReturnType<typeof parseSecureSaveCopy>, reviewCopy: ReturnType<typeof parseSecureSaveReviewCopy>) => { const directStatus = lifecycle.state === 'unsupported' || lifecycle.state === 'invalid' || lifecycle.state === 'accountContext' ? reviewCopy[lifecycle.state] : copy.status[lifecycle.state]; return (directStatus ?? copy.status.error ?? '').replace('{date}', lifecycle.active ? new Date(lifecycle.active.updatedAt).toLocaleString(locale) : ''); };

export function SecureSaveBand({
  allowContinuation,
  lifecycle,
  locale,
  manageOnly,
  neutralOtpHost,
  onVerifiedOwner,
  publicPresentation,
  tenantId,
}: Props) {
  const t = useTranslations('freeStart');
  const copy = parseSecureSaveCopy(t.raw('secureSave'));
  const reviewCopy = parseSecureSaveReviewCopy(t.raw('secureSaveReviewCopy'));
  const [neutralFrontDoor, setNeutralFrontDoor] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedDraft | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const saveAvailable = publicPresentation?.saveAvailable !== false;
  const autoFocusHeading = publicPresentation?.autoFocusHeading ?? false;
  // prettier-ignore
  useEffect(() => { setNeutralFrontDoor(isNeutralFrontDoor(neutralOtpHost)); }, [neutralOtpHost]);
  // A deliberate opener lands on this heading; nothing else here moves focus on first rendering.
  // prettier-ignore
  useEffect(() => { if (autoFocusHeading && neutralFrontDoor) headingRef.current?.focus(); }, [autoFocusHeading, neutralFrontDoor]);
  useEffect(() => {
    if (['saved', 'conflict', 'deleted'].includes(lifecycle.state)) statusRef.current?.focus();
  }, [lifecycle.state]);

  if (!neutralFrontDoor) return null;
  // prettier-ignore
  const alert = ['conflict', 'limit', 'invalid', 'unsupported', 'accountContext', 'error'].includes(lifecycle.state);
  const pending = ['saving', 'loading'].includes(lifecycle.state);
  const status = resolveStatus(lifecycle, locale, copy, reviewCopy);
  // An acknowledged clean draft owns the primary action, so saving and managing step back.
  const continuationReady = Boolean(allowContinuation) && isSavedDraftContinuationReady(lifecycle);
  // prettier-ignore
  return (
<section
data-testid="free-start-secure-save-band"
aria-labelledby="free-start-secure-save-heading"
className="rounded-3xl border border-[#006f72]/25 bg-[#eaf5f2] p-5 sm:p-6"
>
<div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
<div>
<p className="text-xs font-bold uppercase tracking-[0.16em] text-[#006f72]">
{copy.eyebrow}
</p>
<h3
ref={headingRef}
id="free-start-secure-save-heading"
tabIndex={publicPresentation ? -1 : undefined}
className="mt-2 text-2xl font-bold text-[#001a33] outline-none"
>
{saveAvailable ? copy.heading : copy.manage.open}
</h3>
{saveAvailable ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#365265]">{copy.body}</p> : null}
<p className="mt-2 max-w-3xl text-xs leading-5 text-[#526274]">{copy.privacy}</p>
</div>
<SecureSavePrimaryActions copy={copy} lifecycle={lifecycle} manageOnly={manageOnly} saveAvailable={saveAvailable} pending={pending} continuationReady={continuationReady} />
</div>
<p
ref={statusRef}
tabIndex={-1}
role={alert ? 'alert' : 'status'}
aria-live={alert ? undefined : 'polite'}
aria-atomic="true"
data-testid="free-start-save-status"
data-state={lifecycle.state}
className={`mt-4 text-sm font-semibold outline-none ${alert ? 'text-[#8a2f43]' : 'text-[#173b43]'}`}
>
{status}
</p>
<SavedDraftContinuation copy={copy.continuation} enabled={allowContinuation} lifecycle={lifecycle} locale={locale} />
{lifecycle.intent && !lifecycle.verified && !pending ? (
<SecureSaveOtp
key={lifecycle.identityKey}
locale={locale}
tenantId={tenantId}
onVerified={lifecycle.onVerified}
onVerifiedOwner={onVerifiedOwner}
/>
) : null}
<SecureSaveActiveActions copy={copy} lifecycle={lifecycle} manageOnly={manageOnly} saveAvailable={saveAvailable} pending={pending} />
{lifecycle.intent === 'manage' && lifecycle.verified ? (
<SavedDraftList
items={lifecycle.items}
nextCursor={lifecycle.nextCursor}
onDelete={setDeleteTarget}
onLoadMore={lifecycle.loadMore}
onResume={lifecycle.resume}
state={lifecycle.state}
/>
) : null}
{deleteTarget ? (
<div className="mt-5">
<DeleteDraftConfirmation
draft={deleteTarget}
onCancel={() => setDeleteTarget(null)}
onConfirm={() => {
void lifecycle.remove(deleteTarget);
setDeleteTarget(null);
}}
/>
</div>
) : null}
</section>
);
}
