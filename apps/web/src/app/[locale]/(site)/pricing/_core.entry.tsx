import { CommercialBillingTerms } from '@/components/commercial/billing-terms';
import { buildCommercialTermsProps } from '@/components/commercial/billing-terms-content';
import { CommercialDisclaimerNotice } from '@/components/commercial/commercial-disclaimer-notice';
import { CoverageMatrix } from '@/components/commercial/coverage-matrix';
import { buildCoverageMatrixProps } from '@/components/commercial/coverage-matrix-content';
import { ClaimScopeTree } from '@/components/commercial/claim-scope-tree';
import { buildClaimScopeTreeProps } from '@/components/commercial/claim-scope-tree-content';
import { SuccessFeeCalculator } from '@/components/commercial/success-fee-calculator';
import { buildSuccessFeeCalculatorProps } from '@/components/commercial/success-fee-calculator-content';
import { generateLocaleStaticParams } from '@/app/_locale-static-params';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { PricingPageRuntime } from './pricing-page-runtime';

type PricingPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

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
  const [t, coverageMatrix, commercialTerms] = await Promise.all([
    getTranslations({ locale, namespace: 'pricing' }),
    getTranslations({ locale, namespace: 'coverageMatrix' }),
    getTranslations({ locale, namespace: 'commercialTerms' }),
  ]);

  const billingTestMode = process.env.NEXT_PUBLIC_BILLING_TEST_MODE === '1';

  return (
    <div
      className="container py-20 px-4 md:px-6"
      data-testid="pricing-page-ready"
      data-billing-test-mode={billingTestMode ? '1' : '0'}
    >
      <div
        data-testid="pricing-page"
        data-billing-test-mode={billingTestMode ? '1' : '0'}
        className="sr-only"
      />
      <div className="text-center mb-12 max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground">{t('subtitle')}</p>
      </div>

      <CommercialDisclaimerNotice
        sectionTestId="pricing-commercial-disclaimers"
        eyebrow={t('disclaimers.eyebrow')}
        items={[
          {
            title: t('disclaimers.freeStart.title'),
            body: t('disclaimers.freeStart.body'),
          },
          {
            title: t('disclaimers.hotline.title'),
            body: t('disclaimers.hotline.body'),
          },
        ]}
      />

      <PricingPageRuntime billingTestMode={billingTestMode} />

      <div className="mt-16">
        <SuccessFeeCalculator
          {...buildSuccessFeeCalculatorProps(t, 'pricing-success-fee-calculator', locale)}
        />
      </div>

      <div className="mt-16">
        <CommercialBillingTerms
          {...buildCommercialTermsProps(commercialTerms, 'pricing-billing-terms')}
        />
      </div>

      <div className="mt-16">
        <CoverageMatrix {...buildCoverageMatrixProps(coverageMatrix, 'pricing-coverage-matrix')} />
      </div>

      <div className="mt-16">
        <ClaimScopeTree {...buildClaimScopeTreeProps(t, 'pricing-scope-tree')} />
      </div>
    </div>
  );
}

export { generateViewport } from '@/app/_segment-exports';
export const generateStaticParams = generateLocaleStaticParams;
