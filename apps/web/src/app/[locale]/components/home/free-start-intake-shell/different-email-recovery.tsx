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
type ActionResult = { ok: boolean; stage?: string };
type RecoverySetters = Record<'failed' | 'pending', (value: boolean) => void> & {
  code: (value: string) => void;
  email: (value: string) => void;
  stage: (value: Stage) => void;
};

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

function stageText(stage: Stage, copy: Copy) {
  if (stage === 'current') return { body: copy.currentBody, title: copy.currentHeading };
  if (stage === 'replacement') {
    return { body: copy.replacementBody, title: copy.replacementHeading };
  }
  return { body: copy.body, title: copy.heading };
}

function submitText(stage: Stage, pending: boolean, copy: Copy) {
  if (pending) return copy.pending;
  return stage === 'current' ? copy.submitCurrent : copy.confirm;
}

function useRecoveryRunner(isPending: boolean, set: RecoverySetters) {
  const router = useRouter();
  return async (task: () => Promise<ActionResult>) => {
    if (isPending) return;
    set.pending(true);
    set.failed(false);
    try {
      const result = await task();
      if (!result.ok) set.failed(true);
      else if (result.stage === 'current') {
        set.code('');
        set.stage('current');
      } else if (result.stage === 'replacement') {
        set.code('');
        set.email('');
        set.stage('replacement');
      } else {
        set.stage('complete');
        router.refresh();
      }
    } catch {
      set.failed(true);
    } finally {
      set.pending(false);
    }
  };
}

export function DifferentEmailRecovery() {
  const locale = useLocale() as 'sq' | 'en' | 'sr' | 'mk';
  const t = useTranslations('freeStart');
  const copy = parseCopy(t.raw('secureSave'));
  const [stage, setStage] = useState<Stage>('closed');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [stage]);

  const run = useRecoveryRunner(pending, {
    code: setCode,
    email: setEmail,
    failed: setFailed,
    pending: setPending,
    stage: setStage,
  });

  if (!copy) return null;

  // prettier-ignore
  if (stage === 'closed') return (
    <button type="button" data-testid="different-email-recovery-open" onClick={() => setStage('start')}
      className="min-h-11 rounded-xl border border-[#006f72] px-4 text-sm font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]">
      {copy.open}
    </button>
  );

  const { body, title } = stageText(stage, copy);
  const submit = () => {
    if (stage === 'current') return submitCurrentEmailProof({ code, email, locale });
    return confirmReplacementEmail({ code });
  };
  // prettier-ignore
  return (
    <section data-testid="different-email-recovery" aria-labelledby="different-email-recovery-heading"
      className="mt-4 rounded-2xl border border-[#006f72]/25 bg-[#f7fbfa] p-4">
      <h5 ref={heading} tabIndex={-1} id="different-email-recovery-heading" className="font-bold text-[#001a33] outline-none">{title}</h5>
      {stage === 'complete' ? <output className="mt-2 block text-sm text-[#173b43]">{copy.complete}</output> : (
        <>
          <p className="mt-2 text-sm leading-6 text-[#526274]">{body}</p>
          {stage === 'start' ? (
            <button type="button" disabled={pending} onClick={() => void run(() => startDifferentEmailRecovery({ locale }))}
              className="mt-3 min-h-11 rounded-xl bg-[#006f72] px-4 font-bold text-white disabled:opacity-60">
              {pending ? copy.pending : copy.start}
            </button>
          ) : (
            <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void run(submit); }}>
              <label className="block text-sm font-bold text-[#001a33]">{copy.codeLabel}
                <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value)}
                  className="mt-1 block min-h-11 w-full rounded-xl border border-[#001a33]/25 px-3" />
              </label>
              {stage === 'current' ? <label className="block text-sm font-bold text-[#001a33]">{copy.emailLabel}
                <input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}
                  className="mt-1 block min-h-11 w-full rounded-xl border border-[#001a33]/25 px-3" />
              </label> : null}
              <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-[#006f72] px-4 font-bold text-white disabled:opacity-60">
                {submitText(stage, pending, copy)}
              </button>
            </form>
          )}
          {failed ? <p role="alert" className="mt-3 text-sm font-semibold text-[#8a2f43]">{copy.error}</p> : null}
        </>
      )}
      {stage !== 'complete' ? <button type="button" disabled={pending} onClick={() => { setCode(''); setEmail(''); setStage('closed'); setFailed(false); }}
        className="mt-3 min-h-11 px-2 text-sm font-bold text-[#526274] underline">{copy.close}</button> : null}
    </section>
  );
}
