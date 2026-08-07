'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import {
  confirmReplacementEmail,
  startDifferentEmailRecovery,
  submitCurrentEmailProof,
} from '@/actions/different-email-recovery';

type Stage = 'closed' | 'start' | 'current' | 'replacement' | 'complete';
// prettier-ignore
const copyKeys = ['body', 'close', 'codeLabel', 'complete', 'confirm', 'currentBody', 'currentHeading', 'emailLabel', 'error', 'heading', 'open', 'pending', 'replacementBody', 'replacementHeading', 'start', 'submitCurrent'] as const;
type Copy = Record<(typeof copyKeys)[number], string>;

function parseCopy(value: unknown): Copy | null {
  try {
    const candidate = (
      JSON.parse(String(value)) as { manage?: { differentEmailRecovery?: unknown } }
    ).manage?.differentEmailRecovery;
    if (!candidate || typeof candidate !== 'object') return null;
    return copyKeys.every(key => typeof (candidate as Record<string, unknown>)[key] === 'string')
      ? (candidate as Copy)
      : null;
  } catch {
    return null;
  }
}

export function DifferentEmailRecovery() {
  const locale = useLocale() as 'sq' | 'en' | 'sr' | 'mk';
  const t = useTranslations('freeStart');
  const copy = parseCopy(t.raw('secureSave'));
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('closed');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [stage]);

  // prettier-ignore
  const run = async (task: () => Promise<{ ok: boolean; stage?: string }>) => {
    if (pending) return; setPending(true); setFailed(false);
    try {
      const result = await task();
      if (!result.ok) setFailed(true);
      else if (result.stage === 'current') { setCode(''); setStage('current'); }
      else if (result.stage === 'replacement') { setCode(''); setEmail(''); setStage('replacement'); }
      else { setStage('complete'); router.refresh(); }
    } catch { setFailed(true); } finally { setPending(false); }
  };

  if (!copy) return null;

  // prettier-ignore
  if (stage === 'closed') return (
    <button type="button" data-testid="different-email-recovery-open" onClick={() => setStage('start')}
      className="min-h-11 rounded-xl border border-[#006f72] px-4 text-sm font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]">
      {copy.open}
    </button>
  );

  const title =
    stage === 'current'
      ? copy.currentHeading
      : stage === 'replacement'
        ? copy.replacementHeading
        : copy.heading;
  const body =
    stage === 'current'
      ? copy.currentBody
      : stage === 'replacement'
        ? copy.replacementBody
        : copy.body;
  // prettier-ignore
  return (
    <section data-testid="different-email-recovery" aria-labelledby="different-email-recovery-heading"
      className="mt-4 rounded-2xl border border-[#006f72]/25 bg-[#f7fbfa] p-4">
      <h5 ref={heading} tabIndex={-1} id="different-email-recovery-heading" className="font-bold text-[#001a33] outline-none">{title}</h5>
      {stage === 'complete' ? <p role="status" className="mt-2 text-sm text-[#173b43]">{copy.complete}</p> : (
        <>
          <p className="mt-2 text-sm leading-6 text-[#526274]">{body}</p>
          {stage === 'start' ? (
            <button type="button" disabled={pending} onClick={() => void run(() => startDifferentEmailRecovery({ locale }))}
              className="mt-3 min-h-11 rounded-xl bg-[#006f72] px-4 font-bold text-white disabled:opacity-60">
              {pending ? copy.pending : copy.start}
            </button>
          ) : (
            <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void run(() => stage === 'current' ? submitCurrentEmailProof({ code, email, locale }) : confirmReplacementEmail({ code })); }}>
              <label className="block text-sm font-bold text-[#001a33]">{copy.codeLabel}
                <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value)}
                  className="mt-1 block min-h-11 w-full rounded-xl border border-[#001a33]/25 px-3" />
              </label>
              {stage === 'current' ? <label className="block text-sm font-bold text-[#001a33]">{copy.emailLabel}
                <input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}
                  className="mt-1 block min-h-11 w-full rounded-xl border border-[#001a33]/25 px-3" />
              </label> : null}
              <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-[#006f72] px-4 font-bold text-white disabled:opacity-60">
                {pending ? copy.pending : stage === 'current' ? copy.submitCurrent : copy.confirm}
              </button>
            </form>
          )}
          {failed ? <p role="alert" className="mt-3 text-sm font-semibold text-[#8a2f43]">{copy.error}</p> : null}
        </>
      )}
      {stage !== 'complete' ? <button type="button" disabled={pending} onClick={() => { setStage('closed'); setFailed(false); }}
        className="mt-3 min-h-11 px-2 text-sm font-bold text-[#526274] underline">{copy.close}</button> : null}
    </section>
  );
}
