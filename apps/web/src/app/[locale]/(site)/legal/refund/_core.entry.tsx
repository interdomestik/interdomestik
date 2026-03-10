import { CommercialBillingTerms } from '@/components/commercial/billing-terms';
import {
  buildCommercialTermsProps,
  type CommercialTermsSectionKey,
} from '@/components/commercial/billing-terms-content';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type RefundPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.refund' });
  return {
    title: t('title'),
  };
}

export default async function RefundPage({ params }: RefundPageProps) {
  const { locale } = await params;
  const [t, commercialTerms] = await Promise.all([
    getTranslations({ locale, namespace: 'legal.refund' }),
    getTranslations({ locale, namespace: 'commercialTerms' }),
  ]);
  const refundSectionKeys: readonly CommercialTermsSectionKey[] = [
    'refundWindow',
    'coolingOff',
    'acceptedMatters',
  ];

  return (
    <div className="container py-20 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>
      <CommercialBillingTerms
        {...buildCommercialTermsProps(
          commercialTerms,
          'legal-refund-billing-terms',
          refundSectionKeys
        )}
      />
    </div>
  );
}

export { generateViewport } from '@/app/_segment-exports';
