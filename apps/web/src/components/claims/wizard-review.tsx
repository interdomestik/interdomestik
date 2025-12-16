'use client';

import type { CreateClaimValues } from '@/lib/validators/claims';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Separator } from '@interdomestik/ui/components/separator';
import { Clock, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormContext } from 'react-hook-form';

export function WizardReview() {
  const t = useTranslations('evidence');
  const form = useFormContext<CreateClaimValues>();
  const values = form.getValues();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">Review & Submit</h2>
        <p className="text-muted-foreground mt-2">Please check your details before submitting.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Claim Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Category</p>
              <p className="font-medium capitalize">{values.category?.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Date</p>
              <p className="font-medium">{values.incidentDate}</p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground">Company</p>
              <p className="font-medium">{values.companyName}</p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground">Title</p>
              <p className="font-medium">{values.title}</p>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-muted-foreground text-sm mb-1">Description</p>
            <p className="text-sm whitespace-pre-wrap">{values.description}</p>
          </div>

          <div>
            <p className="text-muted-foreground text-sm mb-1">Evidence</p>
            <p className="text-sm">{Array.isArray(values.files) ? values.files.length : 0} files attached</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex items-start gap-2 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">
          <ShieldCheck className="h-4 w-4 mt-0.5" />
          <div>
            <p className="font-semibold text-[hsl(var(--primary))]">{t('privacyBadgeTitle')}</p>
            <p className="text-xs text-[hsl(var(--muted-600))]">{t('privacyBadge')}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 p-3 bg-[hsl(var(--muted))]/30 text-[hsl(var(--muted-900))] rounded-lg text-sm">
          <Clock className="h-4 w-4 mt-0.5" />
          <div>
            <p className="font-semibold">{t('slaTitle')}</p>
            <p className="text-xs text-[hsl(var(--muted-600))]">{t('slaCopy')}</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">{t('consent')}</p>
    </div>
  );
}
