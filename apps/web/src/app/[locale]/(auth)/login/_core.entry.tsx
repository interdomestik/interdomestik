import { LoginForm } from '@/components/auth/login-form';
import { TenantSelector, type TenantOption } from '@/components/auth/tenant-selector';
import { resolveTenantIdFromRequest } from '@/lib/tenant/tenant-request';
import { setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ tenantId?: string }>;
};

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const resolvedTenantId = await resolveTenantIdFromRequest({
    tenantIdFromQuery: resolvedSearchParams?.tenantId ?? null,
    locale,
  });

  const [{ db }, { tenants }, drizzle] = await Promise.all([
    import('@interdomestik/database/db'),
    import('@interdomestik/database/schema'),
    import('drizzle-orm'),
  ]);

  const tenantOptions: TenantOption[] = resolvedTenantId
    ? []
    : await db
        .select({ id: tenants.id, name: tenants.name, countryCode: tenants.countryCode })
        .from(tenants)
        .where(drizzle.eq(tenants.isActive, true))
        .orderBy(drizzle.asc(tenants.name));

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-[hsl(var(--background))] to-[hsl(var(--surface-strong))] p-4">
      {resolvedTenantId ? null : (
        <TenantSelector tenants={tenantOptions} title="Choose your country" />
      )}
      <LoginForm tenantId={resolvedTenantId ?? undefined} />
    </main>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
