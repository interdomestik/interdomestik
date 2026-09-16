'use client';

import type { PublicInformationRequest } from '@interdomestik/domain-claims';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';
import { formatPilotDateTime } from '@/lib/utils/date';

export function ClaimInformationRequests({ requests }: { requests: PublicInformationRequest[] }) {
  const t = useTranslations('claims.informationRequests');
  const locale = useLocale();
  if (!requests.length) return null;
  return (
    <section aria-label={t('title')} data-testid="claim-information-requests" className="space-y-4">
      {requests.map(request => (
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
                    {formatPilotDateTime(request.dueAt, locale, request.dueAt)}
                  </time>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('owner')}</dt>
                <dd>{t('ownerLabel')}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">{t('incomplete')}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
