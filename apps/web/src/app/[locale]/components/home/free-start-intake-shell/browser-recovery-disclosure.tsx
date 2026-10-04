'use client';

import { Check, ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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

const QUIET_ACTION_CLASS =
  'min-h-11 rounded-xl border border-[#006f72] bg-white px-4 text-base font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] focus-visible:ring-offset-2';

/**
 * Device storage is a separate optional decision inside the save area.
 *
 * Expanding it only reveals the complete existing facts: no consent is given and nothing is
 * written until the explicit enable below them. Its actions stay visually quiet so they never
 * compete with the secure-save or saved-draft continuation action above.
 */
export function BrowserRecoveryDisclosure({ decision, onEnable, onSkip }: Props) {
  const t = useTranslations('freeStart');
  const copy = t.raw('localRecoveryDisclosure') as Copy;
  const [open, setOpen] = useState(false);

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

  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section
      data-testid="browser-recovery-disclosure"
      aria-labelledby="browser-recovery-disclosure-heading"
      className="rounded-2xl border border-[#001a33]/15 bg-white p-4 text-[#173b43]"
    >
      <h3 id="browser-recovery-disclosure-heading" className="text-sm font-bold text-[#001a33]">
        <button
          type="button"
          data-testid="browser-recovery-details-open"
          aria-controls="browser-recovery-details"
          aria-expanded={open}
          onClick={() => setOpen(current => !current)}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg text-left text-sm font-bold text-[#006b7b] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
        >
          <Chevron aria-hidden="true" className="h-4 w-4 shrink-0" />
          <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8a5a00]" />
          <span>{copy.heading}</span>
        </button>
      </h3>
      {/* The container stays in the tree so the opener always controls a real element. */}
      <div id="browser-recovery-details">
        {open ? (
          <>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-[#8a5a00]">
              {copy.eyebrow}
            </p>
            <ul className="mt-3 grid gap-3 text-sm leading-6 md:grid-cols-2">
              {[copy.eligible, copy.risk, copy.lifecycle, copy.securePath].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#006f72]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                data-testid="browser-recovery-enable"
                data-emphasis="secondary"
                onClick={onEnable}
                className={QUIET_ACTION_CLASS}
              >
                {copy.enable}
              </button>
              <button
                type="button"
                data-testid="browser-recovery-skip"
                data-emphasis="secondary"
                onClick={onSkip}
                className={QUIET_ACTION_CLASS}
              >
                {copy.skip}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
