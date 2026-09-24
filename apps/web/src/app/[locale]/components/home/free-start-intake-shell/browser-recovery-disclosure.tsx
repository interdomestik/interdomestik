'use client';

import { Check, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type BrowserRecoveryDecision = 'pending' | 'disabled' | 'enabled';

type Copy = Readonly<{
  disabledBody: string;
  disabledHeading: string;
  eligible: string;
  enable: string;
  enableLater: string;
  eyebrow: string;
  heading: string;
  lifecycle: string;
  risk: string;
  securePath: string;
  skip: string;
}>;

type Props = Readonly<{
  decision: BrowserRecoveryDecision;
  onEnable: () => void;
  onSkip: () => void;
}>;

export function BrowserRecoveryDisclosure({ decision, onEnable, onSkip }: Props) {
  const t = useTranslations('freeStart');
  const copy = t.raw('localRecoveryDisclosure') as Copy;

  if (decision === 'enabled') return null;

  if (decision === 'disabled') {
    return (
      <section
        data-testid="browser-recovery-disabled"
        aria-labelledby="browser-recovery-disabled-heading"
        className="rounded-2xl border border-[#001a33]/20 bg-white p-4 text-[#173b43]"
      >
        <div role="status" aria-live="polite" aria-atomic="true">
          <h3 id="browser-recovery-disabled-heading" className="font-bold text-[#001a33]">
            {copy.disabledHeading}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[#526274]">{copy.disabledBody}</p>
        </div>
        <button
          type="button"
          data-testid="browser-recovery-enable-later"
          onClick={onEnable}
          className="mt-3 min-h-11 rounded-xl border border-[#006f72] bg-white px-4 font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] focus-visible:ring-offset-2"
        >
          {copy.enableLater}
        </button>
      </section>
    );
  }

  return (
    <section
      data-testid="browser-recovery-disclosure"
      aria-labelledby="browser-recovery-disclosure-heading"
      className="rounded-3xl border-2 border-[#b77a08]/45 bg-[#fff8e8] p-5 text-[#173b43] sm:p-6"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-[#8a5a00]" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a5a00]">
            {copy.eyebrow}
          </p>
          <h3
            id="browser-recovery-disclosure-heading"
            className="mt-1 text-xl font-bold text-[#001a33]"
          >
            {copy.heading}
          </h3>
        </div>
      </div>
      <ul className="mt-4 grid gap-3 text-sm leading-6 md:grid-cols-2">
        {[copy.eligible, copy.risk, copy.lifecycle, copy.securePath].map(item => (
          <li key={item} className="flex items-start gap-2">
            <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#006f72]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          data-testid="browser-recovery-enable"
          onClick={onEnable}
          className="min-h-12 rounded-xl bg-[#006f72] px-5 font-bold text-white outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] focus-visible:ring-offset-2"
        >
          {copy.enable}
        </button>
        <button
          type="button"
          data-testid="browser-recovery-skip"
          onClick={onSkip}
          className="min-h-12 rounded-xl border border-[#006f72] bg-white px-5 font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
        >
          {copy.skip}
        </button>
      </div>
    </section>
  );
}
