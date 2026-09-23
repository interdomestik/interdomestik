'use client';

import { acknowledgeClaimInformationRequestEvidence } from '@/actions/staff-claims/information-request';
import { ClaimEvidenceUploadDialog } from '@/features/member/claims/components/ClaimEvidenceUploadDialog';
import type { PublicInformationRequest } from '@interdomestik/domain-claims';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { resolveDateLocale } from '@/lib/utils/date';

type EvidenceAcknowledgementButtonProps = Readonly<{
  claimId: string;
  documentId: string;
  requestId: string;
}>;

function EvidenceAcknowledgementButton({
  claimId,
  documentId,
  requestId,
}: EvidenceAcknowledgementButtonProps) {
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
            const result = await acknowledgeClaimInformationRequestEvidence({
              claimId,
              documentId,
              requestId,
            });
            setMessage(result.success ? t('acknowledgementSuccess') : t('acknowledgementError'));
            if (result.success) router.refresh();
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

function appendRequestEvidence(
  requests: PublicInformationRequest[] | null,
  requestId: string,
  evidence: PublicInformationRequest['evidence'][number]
): PublicInformationRequest[] | null {
  if (!requests) return null;

  return requests.map(request => {
    if (
      request.requestId !== requestId ||
      request.evidence.some(existing => existing.documentId === evidence.documentId)
    ) {
      return request;
    }

    return {
      ...request,
      evidence: [...request.evidence, evidence],
      progress: 'submitted',
    };
  });
}

export function ClaimInformationRequests({
  audience,
  canAcknowledge = false,
  claimId,
  requests,
}: {
  readonly audience: 'member' | 'staff';
  readonly canAcknowledge?: boolean;
  readonly claimId: string;
  readonly requests: PublicInformationRequest[] | null;
}) {
  const t = useTranslations('claims.informationRequests');
  const locale = useLocale();
  const [displayRequests, setDisplayRequests] = useState(requests);
  useEffect(() => setDisplayRequests(requests), [requests]);
  // Explicit UTC keeps server rendering and browser hydration on the same deadline.
  const deadlineFormatter = new Intl.DateTimeFormat(resolveDateLocale(locale), {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  if (displayRequests === null)
    return (
      <output className="block" aria-live="polite" aria-atomic="true">
        {t('loadError')}
      </output>
    );
  if (!displayRequests.length) return null;
  return (
    <section aria-label={t('title')} data-testid="claim-information-requests" className="space-y-4">
      {displayRequests.map(request => (
        <Card key={request.requestId} data-testid="claim-information-request">
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 break-words">
            <p className="whitespace-pre-wrap font-medium">{request.requestedInformation}</p>
            <p className="whitespace-pre-wrap">{request.explanationForMember}</p>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">{t('reference')}</dt>
                <dd>{request.requestId}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('dueAt')}</dt>
                <dd>
                  <time dateTime={request.dueAt}>
                    {deadlineFormatter.format(new Date(request.dueAt))} UTC
                  </time>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('owner')}</dt>
                <dd>{t('ownerLabel')}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">{t('incomplete')}</p>
            <p className="text-sm font-medium" data-testid="information-request-progress">
              {t(`progress.${request.progress}`)}
            </p>
            {request.evidence.length ? (
              <ul className="space-y-2" aria-label={t('evidenceList')}>
                {request.evidence.map(evidence => (
                  <li
                    key={evidence.documentId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <p className="font-medium">{evidence.documentName}</p>
                      <p className="text-sm text-muted-foreground">
                        {evidence.acknowledgedAt ? t('acknowledged') : t('submitted')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/api/documents/${evidence.documentId}/download`}>
                          {t('download')}
                        </Link>
                      </Button>
                      {audience === 'staff' && canAcknowledge && !evidence.acknowledgedAt ? (
                        <EvidenceAcknowledgementButton
                          claimId={claimId}
                          documentId={evidence.documentId}
                          requestId={request.requestId}
                        />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {audience === 'member' ? (
              <ClaimEvidenceUploadDialog
                claimId={claimId}
                informationRequestId={request.requestId}
                onUploadSuccess={evidence => {
                  setDisplayRequests(current =>
                    appendRequestEvidence(current, request.requestId, {
                      ...evidence,
                      acknowledgedAt: null,
                    })
                  );
                }}
                trigger={<Button type="button">{t('upload')}</Button>}
              />
            ) : null}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
