import { CommercialBillingTerms } from '@/components/commercial/billing-terms';
import { buildCommercialTermsProps } from '@/components/commercial/billing-terms-content';
import { CoverageMatrix } from '@/components/commercial/coverage-matrix';
import { buildCoverageMatrixProps } from '@/components/commercial/coverage-matrix-content';
import { SuccessFeeCalculator } from '@/components/commercial/success-fee-calculator';
import { buildSuccessFeeCalculatorProps } from '@/components/commercial/success-fee-calculator-content';
import { RegisterForm } from '@/components/auth/register-form';
import { hasGitHubOAuthCredentials } from '@/lib/auth/social-providers';
import { coerceTenantId } from '@/lib/tenant/tenant-hosts';
import { resolveTenantContextFromRequest } from '@/lib/tenant/tenant-request';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ tenantId?: string }>;
};

export default async function RegisterPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [pricing, coverageMatrix, commercialTerms] = await Promise.all([
    getTranslations({ locale, namespace: 'pricing' }),
    getTranslations({ locale, namespace: 'coverageMatrix' }),
    getTranslations({ locale, namespace: 'commercialTerms' }),
  ]);

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const tenantContext = await resolveTenantContextFromRequest({
    tenantIdFromQuery: resolvedSearchParams?.tenantId ?? null,
  });
  const fallbackPublicTenantId =
    coerceTenantId(process.env.DEFAULT_PUBLIC_TENANT_ID) ?? 'tenant_ks';
  const resolvedTenantId = tenantContext?.tenantId ?? fallbackPublicTenantId;
  const tenantClassificationPending =
    tenantContext === null || tenantContext.source === 'default_public';

  return (
    <div
      data-testid="registration-page-ready"
      className="min-h-screen bg-gradient-to-br from-[hsl(var(--background))] to-[hsl(var(--surface-strong))] p-4"
    >
      <div className="mx-auto grid w-full max-w-6xl items-start gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-6">
          <RegisterForm
            githubOAuthEnabled={hasGitHubOAuthCredentials()}
            tenantId={resolvedTenantId}
            tenantClassificationPending={tenantClassificationPending}
          />
        </div>

        <div className="space-y-6">
          <SuccessFeeCalculator
            {...buildSuccessFeeCalculatorProps(pricing, 'register-success-fee-calculator', locale)}
          />
          <CoverageMatrix
            {...buildCoverageMatrixProps(coverageMatrix, 'register-coverage-matrix')}
          />
          <CommercialBillingTerms
            {...buildCommercialTermsProps(commercialTerms, 'register-billing-terms')}
          />
        </div>
      </div>
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
