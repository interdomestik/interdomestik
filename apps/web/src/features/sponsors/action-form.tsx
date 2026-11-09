'use client';

import { Button } from '@interdomestik/ui/components/button';
import { useTranslations } from 'next-intl';
import { useActionState, useId, type ReactNode } from 'react';
import { sponsorAction } from './actions';
import type { SponsorActionResult } from './actions.core';
import type { SponsorOperation } from './input.core';

export function ActionForm({
  operation,
  children,
  target = {},
  disabledReason,
}: Readonly<{
  operation: SponsorOperation;
  children?: ReactNode;
  target?: Record<string, string>;
  disabledReason?: string;
}>): React.JSX.Element {
  const t = useTranslations('sponsors');
  const id = useId();
  const [state, action, pending] = useActionState<SponsorActionResult | null, FormData>(
    async (previous, form) => {
      for (const name of ['termStart', 'termEnd', 'effectiveAt']) {
        const value = form.get(name);
        if (typeof value === 'string' && value) {
          const date = new Date(value);
          if (!Number.isNaN(date.getTime())) form.set(name, date.toISOString());
        }
      }
      try {
        return await sponsorAction(operation, previous, form);
      } catch {
        return { ok: false, error: 'unavailable' };
      }
    },
    null
  );
  let message = '';
  if (state?.ok) message = state.counts ? t('uploadSummary', state.counts) : t('saved');
  else if (state) message = t(`errors.${state.error}`);

  return (
    <form action={action} className="space-y-3 rounded-lg border p-4">
      {Object.entries(target).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <fieldset disabled={pending || Boolean(disabledReason)} className="space-y-3">
        <legend className="font-semibold">{t(`actions.${operation}`)}</legend>
        {children}
        {disabledReason && (
          <p id={id} className="text-sm text-muted-foreground">
            {disabledReason}
          </p>
        )}
        <Button type="submit" aria-describedby={disabledReason ? id : undefined}>
          {t(pending ? 'saving' : `actions.${operation}`)}
        </Button>
      </fieldset>
      <output className="block" aria-live="polite">
        {message}
      </output>
    </form>
  );
}
