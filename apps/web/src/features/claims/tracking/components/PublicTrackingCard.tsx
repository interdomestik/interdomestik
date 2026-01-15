'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@interdomestik/ui/card';
import { format } from 'date-fns'; // or use next-intl formatter
import { useTranslations } from 'next-intl';
import type { PublicClaimStatusDto } from '../types';
import { ClaimStatusBadge } from './ClaimStatusBadge';

interface PublicTrackingCardProps {
  data: PublicClaimStatusDto;
}

export function PublicTrackingCard({ data }: PublicTrackingCardProps) {
  const t = useTranslations('claims-tracking.tracking.public');
  const tNextStep = useTranslations('claims-tracking.status.next_step');

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg" data-testid="public-tracking-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {t('title')}
          <ClaimStatusBadge status={data.status} />
        </CardTitle>
        <CardDescription>
          {t('last_updated', { date: format(new Date(data.lastUpdatedAt), 'PPP') })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-muted/50 rounded-lg">
          <h4 className="font-semibold mb-1">{t('next_step_title')}</h4>
          <p className="text-sm text-muted-foreground">{tNextStep(`${data.status}`)}</p>
        </div>

        <div className="text-xs text-center text-muted-foreground pt-4">{t('no_pii_notice')}</div>
      </CardContent>
    </Card>
  );
}
