'use client';

import {
  acknowledgeClaimInformationRequestEvidence,
  fulfilClaimInformationRequest,
} from '@/actions/staff-claims/information-request';
import { Button } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type EvidenceActionProps = Readonly<{
  claimId: string;
  documentId: string;
  requestId: string;
}>;

export function RequestFulfilmentButton({
  claimId,
  documentId,
  documentName,
  requestId,
  onFulfilled,
}: EvidenceActionProps & {
  documentName: string;
  onFulfilled: (fulfilledAt: string) => void;
}) {
  const t = useTranslations('claims.informationRequests');
  const router = useRouter();
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={reviewed}
          disabled={pending}
          onChange={event => setReviewed(event.target.checked)}
        />
        <span>{t('reviewConfirmation', { documentName })}</span>
      </label>
      <Button
        type="button"
        size="sm"
        disabled={!reviewed}
        aria-disabled={pending}
        aria-busy={pending}
        onClick={() => {
          if (pending) return;
          setMessage(null);
          setFailed(false);
          startTransition(async () => {
            try {
              const result = await fulfilClaimInformationRequest({
                claimId,
                documentId,
                requestId,
                reviewed: true,
              });
              if (result.success) {
                onFulfilled(result.fulfilledAt);
                router.refresh();
              } else {
                setFailed(true);
                setMessage(
                  t(result.error === 'conflict' ? 'fulfilmentConflict' : 'fulfilmentError')
                );
              }
            } catch {
              setFailed(true);
              setMessage(t('fulfilmentError'));
            }
          });
        }}
      >
        {t(pending ? 'fulfilling' : 'fulfil')}
      </Button>
      {failed ? <p role="alert">{message}</p> : <output aria-live="polite">{message}</output>}
    </div>
  );
}

export function EvidenceAcknowledgementButton({
  claimId,
  documentId,
  requestId,
}: EvidenceActionProps) {
  const t = useTranslations('claims.informationRequests');
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            try {
              const result = await acknowledgeClaimInformationRequestEvidence({
                claimId,
                documentId,
                requestId,
              });
              setMessage(result.success ? t('acknowledgementSuccess') : t('acknowledgementError'));
              if (result.success) router.refresh();
            } catch {
              setMessage(t('acknowledgementError'));
            }
          });
        }}
      >
        {pending ? t('acknowledging') : t('acknowledge')}
      </Button>
      {message ? (
        <output className="block text-sm text-muted-foreground" aria-live="polite">
          {message}
        </output>
      ) : null}
    </div>
  );
}
