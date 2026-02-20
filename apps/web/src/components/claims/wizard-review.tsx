'use client';

import type { CreateClaimValues } from '@/lib/validators/claims';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Separator } from '@interdomestik/ui/components/separator';
import { Clock, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormContext } from 'react-hook-form';

import { useNetwork } from '@/hooks/use-network';
import { Alert, AlertDescription, AlertTitle } from '@interdomestik/ui';
import { WifiOff } from 'lucide-react';

export function WizardReview() {
  const tEvidence = useTranslations('evidence');
  const t = useTranslations('wizard.review');
  const tCategory = useTranslations('claimCategories');
  const form = useFormContext<CreateClaimValues>();
  const values = form.getValues();
  const { isOffline } = useNetwork();
  const categoryLabels: Partial<Record<CreateClaimValues['category'], string>> = {
    vehicle: tCategory('vehicle.title'),
    property: tCategory('property.title'),
    injury: tCategory('injury.title'),
    travel: tCategory('travel.title'),
  };
  const categoryLabel = values.category
    ? (categoryLabels[values.category] ?? values.category.replace('_', ' '))
    : '-';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      {isOffline && (
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>{t('offline_title')}</AlertTitle>
          <AlertDescription>{t('offline_description')}</AlertDescription>
        </Alert>
      )}
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
        <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('summary')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">{t('category')}</p>
              <p className="font-medium capitalize">{categoryLabel}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('date')}</p>
              <p className="font-medium">{values.incidentDate}</p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground">{t('company')}</p>
              <p className="font-medium">{values.companyName}</p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground">{t('claim_title')}</p>
              <p className="font-medium">{values.title}</p>
            </div>
            {values.claimAmount && (
              <div className="col-span-2">
                <p className="text-muted-foreground">{t('amount')}</p>
                <p className="font-medium">
                  {values.claimAmount} {values.currency}
                </p>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <p className="text-muted-foreground text-sm mb-1">{t('description')}</p>
            <p className="text-sm whitespace-pre-wrap">{values.description}</p>
          </div>

          <div>
            <p className="text-muted-foreground text-sm mb-1">{t('evidence')}</p>
            <p className="text-sm">
              {t('files_attached', {
                count: Array.isArray(values.files) ? values.files.length : 0,
              })}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex items-start gap-2 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">
          <ShieldCheck className="h-4 w-4 mt-0.5" />
          <div>
            <p className="font-semibold text-[hsl(var(--primary))]">
              {tEvidence('privacyBadgeTitle')}
            </p>
            <p className="text-xs text-[hsl(var(--muted-600))]">{tEvidence('privacyBadge')}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 p-3 bg-[hsl(var(--muted))]/30 text-[hsl(var(--muted-900))] rounded-lg text-sm">
          <Clock className="h-4 w-4 mt-0.5" />
          <div>
            <p className="font-semibold">{tEvidence('slaTitle')}</p>
            <p className="text-xs text-[hsl(var(--muted-600))]">{tEvidence('slaCopy')}</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">{tEvidence('consent')}</p>
    </div>
  );
}
