import { PricingTable } from '@/components/pricing/pricing-table';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

interface PricingPageProps {
  params: Promise<{ locale: string }>;
}

import { Metadata } from 'next';

export async function generateMetadata({ params }: PricingPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing.meta' });
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function PricingPage({ params }: PricingPageProps) {
  const { locale } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const t = await getTranslations({ locale, namespace: 'pricing' });

  return (
    <div className="container py-20 px-4 md:px-6" data-testid="pricing-page-ready">
      <div className="text-center mb-12 max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground">{t('subtitle')}</p>
      </div>

      <PricingTable
        userId={session?.user?.id}
        email={session?.user?.email}
        billingTestMode={process.env.NEXT_PUBLIC_BILLING_TEST_MODE === '1'}
      />

      <div className="mt-20 text-center">
        <p className="text-sm text-muted-foreground">30-Day Money-Back Guarantee</p>
      </div>
    </div>
  );
}

export { generateViewport } from '@/app/_segment-exports';
