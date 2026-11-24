import { CommercialBillingTerms } from '@/components/commercial/billing-terms';
import { buildCommercialTermsProps } from '@/components/commercial/billing-terms-content';
import { CommercialDisclaimerNotice } from '@/components/commercial/commercial-disclaimer-notice';
import { CoverageMatrix } from '@/components/commercial/coverage-matrix';
import { buildCoverageMatrixProps } from '@/components/commercial/coverage-matrix-content';
import { ClaimScopeTree } from '@/components/commercial/claim-scope-tree';
import { buildClaimScopeTreeProps } from '@/components/commercial/claim-scope-tree-content';
import { SuccessFeeCalculatorSurface as FeeSheet } from '@/components/commercial/success-fee-calculator-surface';
import { PricingPlanPreview } from '@/components/pricing/pricing-table/plan-preview';
import { generateLocaleStaticParams } from '@/app/_locale-static-params';
import { Link } from '@/i18n/routing';
import { PUBLIC_FREE_START_ENTRY_HREF } from '@/lib/public-membership-entry';
import { isBillingTestActivationEnabled, releaseClass } from '@/lib/runtime-environment';
import { resolvePublicAdmissionTenant } from '@/lib/tenant/public-admission-tenant';
import {
  authorizeOpenPublicIntake,
  isPublicCheckoutOpen,
} from '@/lib/tenant/public-intake-admission';
import { PADDLE_CLOSED } from '@interdomestik/domain-membership-billing/paddle-closed';
import {
  getPublicBillingCheckoutConfig,
  type PublicBillingCheckoutConfig,
  resolveBillingEntityForTenantId,
  resolveBillingEntityFromPathSegment,
  resolveBillingTenantIdForEntity,
} from '@interdomestik/domain-membership-billing/paddle-server';
import { Button } from '@interdomestik/ui';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import {
  buildNeutralPricingEntryUrl,
  parseNeutralPricingPlan,
} from './neutral-pricing-entry.server';
import { PricingPageRuntime } from './pricing-page-runtime';

type PricingPageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>;
export async function generateMetadata({ params }: PricingPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing.meta' });
  return {
    title: t('title'),
    description: t('description'),
  };
}

type AdmissionTenantId = ReturnType<typeof resolvePublicAdmissionTenant>;

function resolvePricingBillingTenant(env: NodeJS.ProcessEnv, admissionTenantId: AdmissionTenantId) {
  const configuredEntity = resolveBillingEntityFromPathSegment(env.PADDLE_DEFAULT_BILLING_ENTITY);
  // The disposable CI billing fixture has no configured provider entity.
  const billingEntity =
    configuredEntity ??
    (releaseClass(env) === 'local-e2e' && isBillingTestActivationEnabled(env)
      ? resolveBillingEntityForTenantId(admissionTenantId)
      : null);
  const billingTenantId = billingEntity ? resolveBillingTenantIdForEntity(billingEntity) : null;
  return { billingEntity, billingTenantId };
}

function checkoutConfigHasWrongTenant(
  checkoutConfig: PublicBillingCheckoutConfig | null,
  admissionTenantId: AdmissionTenantId
) {
  return checkoutConfig && checkoutConfig.tenantId !== admissionTenantId;
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
  const admissionTenantId = resolvePublicAdmissionTenant(await headers());
  const authority = await authorizeOpenPublicIntake(admissionTenantId);
  let checkoutOpen = false;
  let checkoutConfig: PublicBillingCheckoutConfig | null = null;
  if (!PADDLE_CLOSED) {
    const { billingEntity, billingTenantId } = resolvePricingBillingTenant(
      process.env,
      admissionTenantId
    );
    const checkoutEntity = billingTestMode
      ? billingEntity
      : (resolveBillingEntityFromPathSegment(process.env.NEXT_PUBLIC_PADDLE_BILLING_ENTITY) ??
        billingEntity);
    checkoutOpen = Boolean(
      authority &&
      admissionTenantId === billingTenantId &&
      checkoutEntity &&
      resolveBillingTenantIdForEntity(checkoutEntity) === admissionTenantId &&
      (await isPublicCheckoutOpen(authority))
    );
  }
  if (checkoutOpen && !billingTestMode) {
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
  if (checkoutConfigHasWrongTenant(checkoutConfig, admissionTenantId)) {
    checkoutOpen = false;
    checkoutConfig = null;
  }

  return renderPricingPage({
    admissionTenantId,
    authority,
    billingTestMode,
    checkoutConfig,
    checkoutOpen,
    commercialTerms,
    coverageMatrix,
    hero,
    isRegisterEntry,
    locale,
    resolvedSearchParams,
    t,
  });
}

function renderPricingPage({
  admissionTenantId,
  authority,
  billingTestMode,
  checkoutConfig,
  checkoutOpen,
  commercialTerms,
  coverageMatrix,
  hero,
  isRegisterEntry,
  locale,
  resolvedSearchParams,
  t,
}: Readonly<{
  admissionTenantId: AdmissionTenantId;
  authority: Awaited<ReturnType<typeof authorizeOpenPublicIntake>>;
  billingTestMode: boolean;
  checkoutConfig: PublicBillingCheckoutConfig | null;
  checkoutOpen: boolean;
  commercialTerms: Awaited<ReturnType<typeof getTranslations<'commercialTerms'>>>;
  coverageMatrix: Awaited<ReturnType<typeof getTranslations<'coverageMatrix'>>>;
  hero: Awaited<ReturnType<typeof getTranslations<'hero'>>>;
  isRegisterEntry: boolean;
  locale: string;
  resolvedSearchParams: Awaited<PricingPageProps['searchParams']>;
  t: Awaited<ReturnType<typeof getTranslations<'pricing'>>>;
}>) {
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
        {authority && (
          <div className="mt-6 flex justify-center">
            <Link href={PUBLIC_FREE_START_ENTRY_HREF}>
              <Button size="lg" className="min-h-11 px-6 font-semibold">
                {hero('callNow')}
              </Button>
            </Link>
          </div>
        )}
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
      {checkoutOpen ? (
        <PricingPageRuntime
          billingTenantId={admissionTenantId}
          billingTestMode={billingTestMode}
          checkoutConfig={checkoutConfig}
          entityDisclosure={checkoutConfig?.entityDisclosure ?? null}
          neutralEntryPlan={parseNeutralPricingPlan(resolvedSearchParams)}
          neutralPricingEntryUrl={buildNeutralPricingEntryUrl(locale)}
        />
      ) : (
        <>
          <p
            className="mb-6 text-center text-muted-foreground"
            data-testid="pricing-checkout-closed"
          >
            {t('CLOSED')}
          </p>
          <PricingPlanPreview />
        </>
      )}
      <FeeSheet
        entity={checkoutConfig?.entityDisclosure}
        locale={locale}
        registerEntry={isRegisterEntry}
        surface="pricing"
        t={t}
      />
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
