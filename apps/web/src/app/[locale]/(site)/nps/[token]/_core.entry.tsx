import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { NpsSurveyForm } from './survey-form';

export default async function NpsSurveyPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('nps');

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container max-w-lg mx-auto px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
            <NpsSurveyForm token={token} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
