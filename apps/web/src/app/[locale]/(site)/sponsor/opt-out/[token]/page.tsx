import { OptOutForm } from '@/features/sponsor-opt-out/opt-out-form';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { connection } from 'next/server';
import type { ReactElement } from 'react';

export const instant = false;
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function SponsorOptOutPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}): Promise<ReactElement> {
  await connection();
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('sponsorOptOut');
  // GET only presents the confirmation. No token resolution, validation or domain call.
  return (
    <div
      className="container mx-auto max-w-lg px-4 py-16"
      data-testid="public-sponsor-opt-out-page-ready"
    >
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{t('title')}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p>{t('explanation')}</p>
          <OptOutForm token={token} />
        </CardContent>
      </Card>
    </div>
  );
}
