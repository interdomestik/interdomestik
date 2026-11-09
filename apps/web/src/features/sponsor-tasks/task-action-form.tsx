'use client';

import { Button } from '@interdomestik/ui/components/button';
import { Input } from '@interdomestik/ui/components/input';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { acknowledgeChargeAction, closeHandoverAction, recordEvidenceAction } from './actions';
import type { TaskActionResult } from './tasks.core';

type Props = { kind: 'evidence' | 'close' | 'acknowledge'; id: string };

export function TaskActionForm({ kind, id }: Readonly<Props>): ReactElement {
  const t = useTranslations('sponsorTasks');
  const router = useRouter();
  const formId = useId();
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<TaskActionResult | null>(null);
  const result = useRef<HTMLOutputElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (outcome) result.current?.focus();
  }, [outcome]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    if (kind === 'evidence') {
      const value = form.get('paidUntilUtc');
      let paidUntil = '';
      if (typeof value === 'string') {
        const seconds = value.length === 16 ? ':00' : '';
        paidUntil = `${value}${seconds}Z`;
      }
      form.set('paidUntil', paidUntil);
    }
    submitting.current = true;
    setPending(true);
    setOutcome(null);
    try {
      const actions = {
        evidence: recordEvidenceAction,
        close: closeHandoverAction,
        acknowledge: acknowledgeChargeAction,
      };
      const action = actions[kind];
      const response = await action(form);
      setOutcome(response);
    } catch {
      setOutcome({ ok: false, error: 'error' });
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  let outcomeMessage = '';
  if (outcome?.ok) outcomeMessage = t('saved');
  else if (outcome) {
    const key = outcome.error === 'conflict' ? `conflicts.${kind}` : `errors.${outcome.error}`;
    outcomeMessage = t(key);
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded border p-4" aria-busy={pending}>
      <input type="hidden" name={kind === 'acknowledge' ? 'chargeId' : 'intentId'} value={id} />
      <fieldset disabled={pending || outcome?.ok === true} className="space-y-3">
        <legend className="font-medium">{t(`actions.${kind}`)}</legend>
        {kind === 'evidence' && (
          <>
            <p className="text-sm">{t('evidenceRule')}</p>
            <label className="block" htmlFor={`${formId}-date`}>
              {t('paidUntil')}
            </label>
            <Input
              id={`${formId}-date`}
              name="paidUntilUtc"
              type="datetime-local"
              step="1"
              required
            />
            <label className="block" htmlFor={`${formId}-evidence`}>
              {t('evidenceId')}
            </label>
            <Input
              id={`${formId}-evidence`}
              name="evidenceId"
              maxLength={120}
              required
              autoComplete="off"
            />
          </>
        )}
        {kind === 'close' && (
          <>
            <p className="text-sm">{t('closureRule')}</p>
            <label className="block" htmlFor={`${formId}-disposition`}>
              {t('disposition')}
            </label>
            <select
              id={`${formId}-disposition`}
              name="disposition"
              required
              defaultValue=""
              className="w-full rounded border bg-background p-2 focus-visible:outline focus-visible:outline-2"
            >
              <option value="" disabled>
                {t('chooseDisposition')}
              </option>
              <option value="canceled">{t('dispositions.canceled')}</option>
              <option value="renewing_as_member">{t('dispositions.renewing_as_member')}</option>
            </select>
            <p className="text-sm">{t('renewingRule')}</p>
          </>
        )}
        {kind === 'acknowledge' && <p className="text-sm">{t('refundRule')}</p>}
        <Button type="submit">{t(pending ? 'saving' : `actions.${kind}`)}</Button>
      </fieldset>
      <output
        ref={result}
        tabIndex={-1}
        aria-live="polite"
        className="block rounded focus-visible:outline focus-visible:outline-2"
      >
        {outcomeMessage}
      </output>
      {outcome?.ok && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            document.getElementById('sponsor-tasks-title')?.focus();
            router.refresh();
          }}
        >
          {t('refresh')}
        </Button>
      )}
    </form>
  );
}
