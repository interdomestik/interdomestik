import { CommercialBillingTerms } from '@/components/commercial/billing-terms';
import { buildCommercialTermsProps } from '@/components/commercial/billing-terms-content';
import { getTranslations } from 'next-intl/server';

type TermsPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.terms' });
  return {
    title: t('title'),
  };
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { locale } = await params;
  const [t, commercialTerms] = await Promise.all([
    getTranslations({ locale, namespace: 'legal.terms' }),
    getTranslations({ locale, namespace: 'commercialTerms' }),
  ]);

  return (
    <div className="container py-20 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>
      <div className="prose dark:prose-invert mb-10">
        <p>{t('intro')}</p>
      </div>
      <CommercialBillingTerms
        {...buildCommercialTermsProps(commercialTerms, 'legal-terms-billing-terms')}
      />
    </div>
  );
}

export { generateViewport } from '@/app/_segment-exports';
