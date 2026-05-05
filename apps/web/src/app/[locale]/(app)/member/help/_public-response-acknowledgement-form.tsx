'use client';

import {
  acknowledgeSupportHandoffPublicResponse,
  acknowledgeSupportHandoffPublicResponseAndRedirect,
  type PublicResponseAcknowledgementActionState,
} from '@/actions/support-handoffs/acknowledgement';
import { Button } from '@interdomestik/ui';
import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState, useTransition } from 'react';

type PublicResponseAcknowledgementFormProps = Readonly<{
  acknowledgedAt: string | null;
  acknowledgedAtLabel: string | null;
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
  permalink: string;
}>;

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
  acknowledgedAtLabel,
  expectedPublicResponseVersion,
  handoffId,
  labels,
  locale,
  permalink,
}: PublicResponseAcknowledgementFormProps) {
  const router = useRouter();
  const [optimisticAcknowledgedLabel, setOptimisticAcknowledgedLabel] = useState<string | null>(
    null
  );
  const initialState: PublicResponseAcknowledgementActionState = acknowledgedAt
    ? { acknowledgedAt, acknowledgedAtLabel: acknowledgedAtLabel ?? undefined, success: true }
    : { success: false };
  const [state, setState] = useState<PublicResponseAcknowledgementActionState>(initialState);
  const [pending, startTransition] = useTransition();
  const currentAcknowledgedLabel = state.success
    ? state.acknowledgedAtLabel || acknowledgedAtLabel || optimisticAcknowledgedLabel
    : optimisticAcknowledgedLabel || acknowledgedAtLabel;
  const error = resolveAcknowledgementError(state, labels);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setOptimisticAcknowledgedLabel(labels.acknowledging);
    setState({ success: false });
    startTransition(() => {
      void acknowledgeSupportHandoffPublicResponse({ success: false }, formData)
        .then(result => {
          setState(result);
          if (result.success) {
            router.refresh();
          }
        })
        .catch(() => {
          setOptimisticAcknowledgedLabel(null);
          setState({ error: labels.error, success: false });
        });
    });
  }

  useEffect(() => {
    if (shouldRefreshAfterFailure(state.code)) {
      router.refresh();
    }
  }, [router, state.code]);

  useEffect(() => {
    if (!state.success && (state.error || state.code)) {
      setOptimisticAcknowledgedLabel(null);
    }
  }, [state.code, state.error, state.success]);

  return (
    <div className="pt-1" aria-live="polite">
      {currentAcknowledgedLabel ? (
        <div
          className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-emerald-800"
          data-testid="member-support-handoff-public-response-acknowledged"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{currentAcknowledgedLabel}</span>
        </div>
      ) : (
        <form
          action={acknowledgeSupportHandoffPublicResponseAndRedirect}
          data-testid="member-support-handoff-public-response-ack-form"
          onSubmit={handleSubmit}
        >
          <input type="hidden" name="handoffId" value={handoffId} />
          <input
            type="hidden"
            name="expectedPublicResponseVersion"
            value={expectedPublicResponseVersion}
          />
          <input type="hidden" name="acknowledgedAtLabelTemplate" value={labels.acknowledgedAt} />
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="returnTo" value={permalink} />
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
