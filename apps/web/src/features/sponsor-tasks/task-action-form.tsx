'use client';

import { Button } from '@interdomestik/ui/components/button';
import { Input } from '@interdomestik/ui/components/input';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { acknowledgeChargeAction, closeHandoverAction, recordEvidenceAction } from './actions';
import type { TaskActionResult } from './tasks.core';

type Props = { kind: 'evidence' | 'close' | 'acknowledge'; id: string };

export function TaskActionForm({ kind, id }: Props): ReactElement {
  const t = useTranslations('sponsorTasks');
  const router = useRouter();
  const formId = useId();
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<TaskActionResult | null>(null);
  const result = useRef<HTMLParagraphElement>(null);
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
      form.set(
        'paidUntil',
        typeof value === 'string' ? `${value}${value.length === 16 ? ':00' : ''}Z` : ''
      );
    }
    submitting.current = true;
    setPending(true);
    setOutcome(null);
    try {
      const action =
        kind === 'evidence'
          ? recordEvidenceAction
          : kind === 'close'
            ? closeHandoverAction
            : acknowledgeChargeAction;
      const response = await action(form);
      setOutcome(response);
    } catch {
      setOutcome({ ok: false, error: 'error' });
    } finally {
      setPending(false);
      submitting.current = false;
    }
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
      <p
        ref={result}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="rounded focus-visible:outline focus-visible:outline-2"
      >
        {outcome
          ? t(
              outcome.ok
                ? 'saved'
                : outcome.error === 'conflict'
                  ? `conflicts.${kind}`
                  : `errors.${outcome.error}`
            )
          : ''}
      </p>
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
