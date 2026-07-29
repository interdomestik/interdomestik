'use client';

import { useTranslations } from 'next-intl';

import type { useAnonymousDraftRecovery } from './use-anonymous-draft-recovery';

type Props = Readonly<{ recovery: ReturnType<typeof useAnonymousDraftRecovery> }>;
type RecoveryCopy = Readonly<{
  body: string;
  continue: string;
  discard: string;
  eyebrow: string;
  heading: string;
  offerBody: string;
  offerHeading: string;
  privateDevice: string;
  status: Record<'conflict' | 'discarded' | 'saved' | 'secure' | 'unavailable', string>;
}>;

export function AnonymousDraftRecoveryBand({ recovery }: Props) {
  const t = useTranslations('freeStart');
  const secureCopy = JSON.parse(String(t.raw('secureSave'))) as {
    recovery: RecoveryCopy;
    startAnother: string;
  };
  const copy = secureCopy.recovery;
  if (recovery.state === 'idle') return null;

  const hasOffer = Boolean(recovery.offer);
  const fresh = recovery.state === 'discarded';
  const recoverable = hasOffer || recovery.state === 'saved' || recovery.state === 'conflict';
  const status =
    recovery.state === 'offer'
      ? copy.offerBody
      : copy.status[recovery.state as keyof RecoveryCopy['status']];
  let heading = status;
  if (recoverable) heading = copy.heading;
  if (hasOffer) heading = copy.offerHeading;

  return (
    <section
      data-testid={hasOffer ? 'anonymous-draft-recovery-offer' : 'anonymous-draft-recovery-status'}
      aria-labelledby="anonymous-draft-recovery-heading"
      className="rounded-2xl border border-[#006f72]/25 bg-[#eef8f5] p-4 text-[#173b43]"
    >
      {recoverable ? (
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#006f72]">
          {copy.eyebrow}
        </p>
      ) : null}
      <h3 id="anonymous-draft-recovery-heading" className="mt-1 text-lg font-bold text-[#001a33]">
        {heading}
      </h3>
      {recoverable ? (
        <>
          <p className="mt-1 text-sm leading-6">{hasOffer ? copy.offerBody : copy.body}</p>
          <p className="mt-1 text-xs leading-5 text-[#526274]">{copy.privateDevice}</p>
        </>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={hasOffer || !recoverable ? 'sr-only' : 'mt-2 text-sm font-semibold'}
      >
        {status}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {hasOffer ? (
          <button
            type="button"
            onClick={recovery.resume}
            className="min-h-11 rounded-xl bg-[#006f72] px-4 font-bold text-white outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] focus-visible:ring-offset-2"
          >
            {copy.continue}
          </button>
        ) : null}
        {recoverable || fresh ? (
          <button
            type="button"
            onClick={recovery.discard}
            className="min-h-11 rounded-xl border border-[#006f72] bg-white px-4 font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
          >
            {fresh ? secureCopy.startAnother : copy.discard}
          </button>
        ) : null}
      </div>
    </section>
  );
}
