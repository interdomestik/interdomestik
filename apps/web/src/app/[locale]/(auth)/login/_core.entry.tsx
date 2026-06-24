import { LoginForm } from '@/components/auth/login-form';
import { getSessionSafe } from '@/components/shell/session';
import { TenantSelector, type TenantOption } from '@/components/auth/tenant-selector';
import { getCanonicalRouteForRole } from '@/lib/canonical-routes';
import { hasGitHubOAuthCredentials } from '@/lib/auth/social-providers';
import { coerceTenantId } from '@/lib/tenant/tenant-hosts';
import { resolveTenantContextFromRequest } from '@/lib/tenant/tenant-request';
import { FileText, Globe2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getLoginTenantBootstrapRedirect, loadTenantOptions } from './_core';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ tenantId?: string; plan?: string }>;
};

type PortalCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  panelTitle: string;
  panelBody: string;
  formRegionLabel: string;
  chips: string[];
};

function AuthPortalHero({ copy }: { readonly copy: PortalCopy }) {
  return (
    <section
      data-testid="auth-portal-hero"
      aria-labelledby="auth-portal-title"
      className="relative hidden min-h-full overflow-hidden rounded-lg border border-white/15 bg-[hsl(var(--primary))] p-8 text-white shadow-xl lg:flex lg:flex-col lg:justify-between"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:42px_42px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-16 hidden h-px bg-white/30 lg:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-8 left-10 hidden h-40 w-[72%] rounded-lg border border-white/15 bg-white/5 lg:block"
      />
      <div className="relative z-10 max-w-xl">
        <p className="text-xs font-semibold uppercase text-white/75">{copy.eyebrow}</p>
        <h1
          id="auth-portal-title"
          className="mt-2 max-w-lg text-2xl font-bold leading-tight sm:text-3xl lg:text-5xl"
        >
          {copy.panelTitle}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-white/80 sm:text-base lg:mt-5">
          {copy.panelBody}
        </p>
      </div>

      <div className="relative z-10 mt-10 grid grid-cols-3 gap-2">
        <div className="flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-3 text-sm text-white/90">
          <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{copy.chips[0]}</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-3 text-sm text-white/90">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{copy.chips[1]}</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-3 text-sm text-white/90">
          <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{copy.chips[2]}</span>
        </div>
      </div>

      <Globe2
        aria-hidden="true"
        className="pointer-events-none absolute bottom-5 right-5 hidden h-28 w-28 text-white/10 lg:block"
      />
    </section>
  );
}

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSessionSafe('LoginPage');
  if (session?.user?.role) {
    const canonical = getCanonicalRouteForRole(session.user.role, locale);
    if (canonical) {
      redirect(canonical);
    }
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const tenantContext = await resolveTenantContextFromRequest();
  const tenantIdFromContext = tenantContext.kind === 'tenant' ? tenantContext.tenantId : null;
  const bootstrapRedirect = getLoginTenantBootstrapRedirect({
    locale,
    tenantIdFromQuery: resolvedSearchParams?.tenantId ?? null,
    planIdFromQuery: resolvedSearchParams?.plan ?? null,
    tenantIdFromContext,
  });
  if (bootstrapRedirect) redirect(bootstrapRedirect);

  const resolvedTenantId =
    tenantIdFromContext ?? coerceTenantId(resolvedSearchParams?.tenantId ?? undefined);

  const [{ db }, { tenants }, drizzle] = await Promise.all([
    import('@interdomestik/database/db'),
    import('@interdomestik/database/schema'),
    import('drizzle-orm'),
  ]);

  const tenantOptions: TenantOption[] = await loadTenantOptions({
    resolvedTenantId,
    loadTenants: async () =>
      // db-access-guard: system-exempt -- reason: public login tenant selector lists active tenant metadata only
      db
        .select({ id: tenants.id, name: tenants.name, countryCode: tenants.countryCode })
        .from(tenants)
        .where(drizzle.eq(tenants.isActive, true))
        .orderBy(drizzle.asc(tenants.name)),
  });

  const t = await getTranslations({ locale, namespace: 'auth.login' });

  const portalCopy: PortalCopy = {
    eyebrow: t('portal.eyebrow'),
    title: t('portal.title'),
    subtitle: t('portal.subtitle'),
    panelTitle: t('portal.panelTitle'),
    panelBody: t('portal.panelBody'),
    formRegionLabel: t('portal.formRegionLabel'),
    chips: [t('portal.chipSecure'), t('portal.chipStatus'), t('portal.chipDocuments')],
  };

  return (
    <main
      data-testid="auth-ready"
      className="min-h-dvh overflow-x-hidden bg-[hsl(var(--surface-strong))] px-4 py-4 text-[hsl(var(--foreground))] sm:px-6 lg:p-8"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-4 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:items-stretch">
        <AuthPortalHero copy={portalCopy} />

        <section
          data-testid="auth-portal-form-region"
          aria-label={portalCopy.formRegionLabel}
          className="flex min-w-0 flex-col items-center justify-center gap-4 lg:gap-6"
        >
          <div className="w-full max-w-md text-center lg:hidden">
            <p className="text-xs font-semibold uppercase text-[hsl(var(--primary))]">
              {portalCopy.eyebrow}
            </p>
            <h1 className="mt-1 text-xl font-bold leading-tight text-[hsl(var(--foreground))]">
              {portalCopy.title}
            </h1>
            <p className="mt-1 text-sm leading-5 text-[hsl(var(--muted-foreground))]">
              {portalCopy.subtitle}
            </p>
          </div>

          {resolvedTenantId ? null : (
            <TenantSelector tenants={tenantOptions} title={t('portal.tenantTitle')} />
          )}
          <LoginForm
            githubOAuthEnabled={hasGitHubOAuthCredentials()}
            tenantId={resolvedTenantId ?? undefined}
          />
        </section>
      </div>
    </main>
  );
}
export { generateMetadata, generateViewport } from '@/app/_segment-exports';
