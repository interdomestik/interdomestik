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
import { Link } from '@/i18n/routing';
import { PUBLIC_FREE_START_ENTRY_HREF } from '@/lib/public-membership-entry';
import {
  getPublicBillingCheckoutConfig,
  type PublicBillingCheckoutConfig,
  resolveBillingEntityFromPathSegment,
  resolveBillingTenantIdForEntity,
} from '@interdomestik/domain-membership-billing/paddle-server';
import { Button } from '@interdomestik/ui';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { PricingPageRuntime } from './pricing-page-runtime';

type PricingPageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ entry?: string }>;
}>;

export async function generateMetadata({ params }: PricingPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing.meta' });
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function PricingPage({ params, searchParams }: PricingPageProps) {
  const { locale } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const isRegisterEntry = resolvedSearchParams?.entry === 'register';
  const [t, hero, coverageMatrix, commercialTerms] = await Promise.all([
    getTranslations({ locale, namespace: 'pricing' }),
    getTranslations({ locale, namespace: 'hero' }),
    getTranslations({ locale, namespace: 'coverageMatrix' }),
    getTranslations({ locale, namespace: 'commercialTerms' }),
  ]);

  const billingTestMode = process.env.NEXT_PUBLIC_BILLING_TEST_MODE === '1';
  const billingEntity = resolveBillingEntityFromPathSegment(
    process.env.PADDLE_DEFAULT_BILLING_ENTITY
  );
  const billingTenantId = billingEntity ? resolveBillingTenantIdForEntity(billingEntity) : null;
  let checkoutConfig: PublicBillingCheckoutConfig | null = null;

  if (!billingTestMode) {
    try {
      checkoutConfig = getPublicBillingCheckoutConfig();
    } catch (error) {
      if (
        process.env.VERCEL_ENV !== 'production' &&
        process.env.NEXT_PUBLIC_PADDLE_ENV !== 'production'
      ) {
        console.warn('Public Paddle checkout config unavailable for pricing page:', error);
      } else {
        throw error;
      }
    }
  }
  const resolvedBillingTenantId = checkoutConfig?.tenantId ?? billingTenantId;

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
        <div className="mt-6 flex justify-center">
          <Link href={PUBLIC_FREE_START_ENTRY_HREF}>
            <Button size="lg" className="min-h-11 px-6 font-semibold">
              {hero('callNow')}
            </Button>
          </Link>
        </div>
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

      <PricingPageRuntime
        billingTenantId={resolvedBillingTenantId}
        billingTestMode={billingTestMode}
        checkoutConfig={checkoutConfig}
        entityDisclosure={checkoutConfig?.entityDisclosure ?? null}
      />

      <div className="mt-16">
        <div data-testid={isRegisterEntry ? 'register-success-fee-calculator' : undefined}>
          <SuccessFeeCalculator
            {...buildSuccessFeeCalculatorProps(t, 'pricing-success-fee-calculator', locale)}
          />
        </div>
      </div>

      <div className="mt-16">
        <div data-testid={isRegisterEntry ? 'register-billing-terms' : undefined}>
          <CommercialBillingTerms
            {...buildCommercialTermsProps(commercialTerms, 'pricing-billing-terms')}
          />
        </div>
      </div>

      <div className="mt-16">
        <div data-testid={isRegisterEntry ? 'register-coverage-matrix' : undefined}>
          <CoverageMatrix
            {...buildCoverageMatrixProps(coverageMatrix, 'pricing-coverage-matrix')}
          />
        </div>
      </div>

      <div className="mt-16">
        <ClaimScopeTree {...buildClaimScopeTreeProps(t, 'pricing-scope-tree')} />
      </div>
    </div>
  );
}

export { generateViewport } from '@/app/_segment-exports';
export const generateStaticParams = generateLocaleStaticParams;
