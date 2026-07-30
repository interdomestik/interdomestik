'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DeleteDraftConfirmation } from './delete-draft-confirmation';
import { SavedDraftList } from './saved-draft-list';
import { SecureSaveOtp } from './secure-save-otp';
import { parseSecureSaveCopy, parseSecureSaveReviewCopy, type SavedDraft } from './types';
import type { useDraftLifecycle } from './use-draft-lifecycle';

// prettier-ignore
type Props = Readonly<{ lifecycle: ReturnType<typeof useDraftLifecycle>; locale: string; manageOnly?: boolean; neutralOtpHost?: string | null; tenantId?: string | null }>;
// prettier-ignore
const hasSaveableChanges = (lifecycle: ReturnType<typeof useDraftLifecycle>) => ['dirty', 'error'].includes(lifecycle.state) || (lifecycle.state === 'deleted' && lifecycle.hasUnsavedChanges), isNeutralFrontDoor = (neutralOtpHost?: string | null) => ['ida.interdomestik.com', 'ida.localhost', 'ida.127.0.0.1.nip.io'].includes(globalThis.location.hostname) || Boolean(neutralOtpHost && globalThis.location.host.toLowerCase() === neutralOtpHost);

export function SecureSaveBand({ lifecycle, locale, manageOnly, neutralOtpHost, tenantId }: Props) {
  const t = useTranslations('freeStart');
  const copy = parseSecureSaveCopy(t.raw('secureSave'));
  const reviewCopy = parseSecureSaveReviewCopy(t.raw('secureSaveReviewCopy'));
  const [neutralFrontDoor, setNeutralFrontDoor] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedDraft | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  // prettier-ignore
  useEffect(() => { setNeutralFrontDoor(isNeutralFrontDoor(neutralOtpHost)); }, [neutralOtpHost]);
  useEffect(() => {
    if (['saved', 'conflict', 'deleted'].includes(lifecycle.state)) statusRef.current?.focus();
  }, [lifecycle.state]);

  if (!neutralFrontDoor) return null;
  // prettier-ignore
  const alert = ['conflict', 'limit', 'invalid', 'unsupported', 'accountContext', 'error'].includes(lifecycle.state);
  const pending = ['saving', 'loading'].includes(lifecycle.state);
  // prettier-ignore
  const directStatus = lifecycle.state === 'unsupported' || lifecycle.state === 'invalid' || lifecycle.state === 'accountContext' ? reviewCopy[lifecycle.state] : copy.status[lifecycle.state], status = (directStatus ?? copy.status.error ?? '').replace('{date}', lifecycle.active ? new Date(lifecycle.active.updatedAt).toLocaleString(locale) : '');
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
id="free-start-secure-save-heading"
className="mt-2 text-2xl font-bold text-[#001a33]"
>
{copy.heading}
</h3>
<p className="mt-2 max-w-3xl text-sm leading-6 text-[#365265]">{copy.body}</p>
<p className="mt-2 max-w-3xl text-xs leading-5 text-[#526274]">{copy.privacy}</p>
</div>
<div className="flex flex-wrap gap-3">
{!manageOnly ? (
<button
type="button"
data-testid="free-start-save-open"
disabled={pending}
onClick={lifecycle.openSave}
className="min-h-11 rounded-xl bg-[#006f72] px-5 text-base font-bold text-white outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] focus-visible:ring-offset-2"
>
{copy.save}
</button>
) : null}
<button
type="button"
data-testid="free-start-manage-open"
disabled={pending}
onClick={lifecycle.openManage}
className="min-h-11 rounded-xl border border-[#006f72] bg-white px-5 text-base font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
>
{copy.manage.open}
</button>
</div>
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
{lifecycle.intent && !lifecycle.verified && !pending ? (
<SecureSaveOtp
key={lifecycle.identityKey}
locale={locale}
tenantId={tenantId}
onVerified={lifecycle.onVerified}
/>
) : null}
{lifecycle.active ? (
<div className="mt-4 flex flex-wrap gap-3">
{hasSaveableChanges(lifecycle) ? (
<button
type="button"
data-testid="free-start-save-changes"
disabled={pending}
onClick={lifecycle.saveChanges}
className="min-h-11 rounded-xl bg-[#006f72] px-5 font-bold text-white"
>
{copy.saveChanges}
</button>
) : null}
{!manageOnly ? (
<button
type="button"
data-testid="free-start-start-another"
disabled={pending}
onClick={lifecycle.startAnother}
className="min-h-11 rounded-xl border border-[#006f72] bg-white px-5 font-bold text-[#006f72]"
>
{copy.startAnother}
</button>
) : null}
</div>
) : null}
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
