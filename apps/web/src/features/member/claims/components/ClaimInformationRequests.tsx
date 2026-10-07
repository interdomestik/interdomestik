'use client';

import { ClaimEvidenceUploadDialog } from '@/features/member/claims/components/ClaimEvidenceUploadDialog';
import {
  EvidenceAcknowledgementButton,
  RequestFulfilmentButton,
} from '@/features/member/claims/components/information-request-staff-actions';
import { MemberEvidenceDownloadButton } from '@/features/member/claims/components/member-evidence-download-button';
import { InformationRequestReadRecovery } from '@/features/member/claims/components/information-request-read-recovery';
import type { PublicInformationRequest } from '@interdomestik/domain-claims';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { resolveDateLocale } from '@/lib/utils/date';

function getRequestNextAction(request: PublicInformationRequest): {
  actor: 'member' | 'assignedStaff' | 'none';
  action: 'uploadEvidence' | 'reviewEvidence' | 'reviewRequest' | 'none';
} {
  if (request.status === 'fulfilled') return { actor: 'none', action: 'none' };
  const progress = request.progress;
  switch (progress) {
    case 'awaiting_evidence':
      return { actor: 'member', action: 'uploadEvidence' };
    case 'submitted':
      return { actor: 'assignedStaff', action: 'reviewEvidence' };
    case 'acknowledged':
      return { actor: 'assignedStaff', action: 'reviewRequest' };
  }
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

function markRequestFulfilled(
  requests: PublicInformationRequest[] | null,
  requestId: string,
  documentId: string,
  fulfilledAt: string
): PublicInformationRequest[] | null {
  return (
    requests?.map(request =>
      request.requestId === requestId
        ? { ...request, status: 'fulfilled', fulfilledAt, fulfilledDocumentId: documentId }
        : request
    ) ?? null
  );
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
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [recentFulfilledId, setRecentFulfilledId] = useState<string | null>(null);
  const fulfilledStatusRef = useRef<HTMLElement | null>(null);
  useEffect(() => setDisplayRequests(requests), [requests]);
  useEffect(() => {
    if (recentFulfilledId) fulfilledStatusRef.current?.focus();
  }, [recentFulfilledId]);
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
  // One persistent region across failure, retry and success keeps keyboard focus recoverable.
  if (displayRequests === null) return <InformationRequestReadRecovery failed />;
  if (!displayRequests.length) {
    return (
      <InformationRequestReadRecovery failed={false}>
        <p className="text-sm text-muted-foreground" data-testid="information-request-empty">
          {t('empty')}
        </p>
      </InformationRequestReadRecovery>
    );
  }
  const list = (
    <div data-testid="claim-information-requests" className="space-y-4">
      {announcement ? (
        <output className="block text-sm" aria-live="polite" aria-atomic="true">
          {announcement}
        </output>
      ) : null}
      {displayRequests.map(request => {
        const next = getRequestNextAction(request);
        return (
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
                <div>
                  <dt className="text-muted-foreground">{t('statusLabel')}</dt>
                  <dd
                    data-testid="information-request-status"
                    tabIndex={request.requestId === recentFulfilledId ? -1 : undefined}
                    ref={request.requestId === recentFulfilledId ? fulfilledStatusRef : undefined}
                  >
                    {t(`status.${request.status}`)}
                  </dd>
                </div>
                {request.fulfilledAt && request.fulfilledDocumentId ? (
                  <div>
                    <dt className="text-muted-foreground">{t('fulfilledUsing')}</dt>
                    <dd>
                      {request.evidence.find(
                        item => item.documentId === request.fulfilledDocumentId
                      )?.documentName ?? request.fulfilledDocumentId}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted-foreground">{t('nextActorLabel')}</dt>
                  <dd data-testid="information-request-next-actor">
                    {t(`nextActor.${next.actor}`)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('nextActionLabel')}</dt>
                  <dd data-testid="information-request-next-action">
                    {t(`nextAction.${next.action}`)}
                  </dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">{t('incomplete')}</p>
              {request.status === 'open' ? (
                <p className="text-sm font-medium" data-testid="information-request-progress">
                  {t(`progress.${request.progress}`)}
                </p>
              ) : null}
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
                        {audience === 'member' ? (
                          <MemberEvidenceDownloadButton
                            documentId={evidence.documentId}
                            documentName={evidence.documentName}
                          />
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/api/documents/${evidence.documentId}/download`}>
                              {t('download')}
                            </Link>
                          </Button>
                        )}
                        {audience === 'staff' &&
                        canAcknowledge &&
                        request.status === 'open' &&
                        !evidence.acknowledgedAt ? (
                          <EvidenceAcknowledgementButton
                            claimId={claimId}
                            documentId={evidence.documentId}
                            requestId={request.requestId}
                          />
                        ) : null}
                        {audience === 'staff' &&
                        canAcknowledge &&
                        request.status === 'open' &&
                        evidence.acknowledgedAt ? (
                          <RequestFulfilmentButton
                            claimId={claimId}
                            documentId={evidence.documentId}
                            documentName={evidence.documentName}
                            requestId={request.requestId}
                            onFulfilled={fulfilledAt => {
                              setDisplayRequests(current =>
                                markRequestFulfilled(
                                  current,
                                  request.requestId,
                                  evidence.documentId,
                                  fulfilledAt
                                )
                              );
                              setRecentFulfilledId(request.requestId);
                              setAnnouncement(t('fulfilmentSuccess'));
                            }}
                          />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {audience === 'member' && request.status === 'open' ? (
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
        );
      })}
    </div>
  );
  return <InformationRequestReadRecovery failed={false}>{list}</InformationRequestReadRecovery>;
}
