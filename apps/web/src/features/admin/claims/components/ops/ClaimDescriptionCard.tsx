'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { useTranslations } from 'next-intl';

interface ClaimDescriptionCardProps {
  description: string | null;
}

export function ClaimDescriptionCard({ description }: ClaimDescriptionCardProps) {
  const t = useTranslations('agent.details');
  const tDetail = useTranslations('admin.claims_page.detail');

  return (
    <Card className="flex-1 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
          {t('description')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {description || <span className="italic opacity-50">{tDetail('description.empty')}</span>}
        </p>
      </CardContent>
    </Card>
  );
}
