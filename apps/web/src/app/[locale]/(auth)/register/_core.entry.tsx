import { CommercialBillingTerms } from '@/components/commercial/billing-terms';
import { buildCommercialTermsProps } from '@/components/commercial/billing-terms-content';
import { CoverageMatrix } from '@/components/commercial/coverage-matrix';
import { buildCoverageMatrixProps } from '@/components/commercial/coverage-matrix-content';
import { SuccessFeeCalculator } from '@/components/commercial/success-fee-calculator';
import { buildSuccessFeeCalculatorProps } from '@/components/commercial/success-fee-calculator-content';
import { RegisterForm } from '@/components/auth/register-form';
import { TenantSelector, type TenantOption } from '@/components/auth/tenant-selector';
import { resolveTenantIdFromRequest } from '@/lib/tenant/tenant-request';
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
  const resolvedTenantId = await resolveTenantIdFromRequest({
    tenantIdFromQuery: resolvedSearchParams?.tenantId ?? null,
  });

  const [{ db }, { tenants }, drizzle] = await Promise.all([
    import('@interdomestik/database/db'),
    import('@interdomestik/database/schema'),
    import('drizzle-orm'),
  ]);

  let tenantOptions: TenantOption[] = [];
  if (!resolvedTenantId) {
    try {
      tenantOptions = await db
        .select({ id: tenants.id, name: tenants.name, countryCode: tenants.countryCode })
        .from(tenants)
        .where(drizzle.eq(tenants.isActive, true))
        .orderBy(drizzle.asc(tenants.name));
    } catch (error) {
      console.error('[RegisterPage] Failed to load tenant options:', error);
      tenantOptions = [
        { id: 'tenant_ks', name: 'Interdomestik (KS)', countryCode: 'XK' },
        { id: 'tenant_mk', name: 'Interdomestik (MK)', countryCode: 'MK' },
        { id: 'pilot-mk', name: 'Pilot Macedonia', countryCode: 'MK' },
      ];
    }
  }

  return (
    <div
      data-testid="registration-page-ready"
      className="min-h-screen bg-gradient-to-br from-[hsl(var(--background))] to-[hsl(var(--surface-strong))] p-4"
    >
      <div className="mx-auto grid w-full max-w-6xl items-start gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-6">
          {resolvedTenantId ? null : <TenantSelector tenants={tenantOptions} />}
          <RegisterForm tenantId={resolvedTenantId ?? undefined} />
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
