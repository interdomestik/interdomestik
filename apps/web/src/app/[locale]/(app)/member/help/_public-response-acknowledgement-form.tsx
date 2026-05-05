'use client';

import {
  acknowledgeSupportHandoffPublicResponse,
  type PublicResponseAcknowledgementActionState,
} from '@/actions/support-handoffs/acknowledgement';
import { Button } from '@interdomestik/ui';
import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';

type PublicResponseAcknowledgementFormProps = Readonly<{
  acknowledgedAt: string | null;
  expectedPublicResponseVersion: number;
  handoffId: string;
  labels: {
    acknowledge: string;
    acknowledgedAt: string;
    acknowledging: string;
    error: string;
    stale: string;
  };
  locale: string;
}>;

function formatDateTime(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
    timeStyle: 'short',
  }).format(date);
}

function formatAcknowledgedAt(template: string, value: string, locale: string) {
  const formatted = formatDateTime(value, locale);
  return formatted ? template.replace('{date}', formatted) : template.replace('{date}', value);
}

function resolveAcknowledgementError(
  state: PublicResponseAcknowledgementActionState,
  labels: PublicResponseAcknowledgementFormProps['labels']
) {
  if (state.success || (!state.error && !state.code)) {
    return null;
  }

  if (state.code === 'STALE_VERSION') {
    return labels.stale;
  }

  return labels.error;
}

function shouldRefreshAfterFailure(code: PublicResponseAcknowledgementActionState['code']) {
  return code === 'STALE_VERSION' || code === 'CLOSED';
}

export function PublicResponseAcknowledgementForm({
  acknowledgedAt,
  expectedPublicResponseVersion,
  handoffId,
  labels,
  locale,
}: PublicResponseAcknowledgementFormProps) {
  const router = useRouter();
  const [optimisticAcknowledgedAt, setOptimisticAcknowledgedAt] = useState<string | null>(null);
  const initialState: PublicResponseAcknowledgementActionState = acknowledgedAt
    ? { acknowledgedAt, success: true }
    : { success: false };
  const [state, formAction, pending] = useActionState(
    acknowledgeSupportHandoffPublicResponse,
    initialState
  );
  const currentAcknowledgedAt = state.success
    ? state.acknowledgedAt
    : optimisticAcknowledgedAt || acknowledgedAt;
  const error = resolveAcknowledgementError(state, labels);

  useEffect(() => {
    if (shouldRefreshAfterFailure(state.code)) {
      router.refresh();
    }
  }, [router, state.code]);

  useEffect(() => {
    if (!state.success && (state.error || state.code)) {
      setOptimisticAcknowledgedAt(null);
    }
  }, [state.code, state.error, state.success]);

  return (
    <div className="pt-1" aria-live="polite">
      {currentAcknowledgedAt ? (
        <div
          className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-emerald-800"
          data-testid="member-support-handoff-public-response-acknowledged"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{formatAcknowledgedAt(labels.acknowledgedAt, currentAcknowledgedAt, locale)}</span>
        </div>
      ) : (
        <form
          action={formAction}
          data-testid="member-support-handoff-public-response-ack-form"
          onSubmit={() => setOptimisticAcknowledgedAt(new Date().toISOString())}
        >
          <input type="hidden" name="handoffId" value={handoffId} />
          <input
            type="hidden"
            name="expectedPublicResponseVersion"
            value={expectedPublicResponseVersion}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={pending}
            className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
            data-testid="member-support-handoff-public-response-ack-submit"
          >
            {pending ? labels.acknowledging : labels.acknowledge}
          </Button>
        </form>
      )}
      {error ? (
        <p
          className="mt-2 text-xs font-medium text-red-700"
          data-testid="member-support-handoff-public-response-ack-error"
        >
          {error || labels.error}
        </p>
      ) : null}
    </div>
  );
}
