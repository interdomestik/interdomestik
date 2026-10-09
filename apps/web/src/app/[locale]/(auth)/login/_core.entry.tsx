import 'server-only';

// The neutral entry reuses the single exact host-admission authority that the sign-in route uses;
// this pure module derives no tenant and owns no routing.
import { resolveNeutralEmailSignInHost } from '@/app/api/auth/[...all]/neutral-email-sign-in-admission';
import { LoginForm } from '@/components/auth/login-form';
import { resolveSafeNextPath } from '@/components/auth/login-next-path';
import { getSessionSafe } from '@/components/shell/session';
import { getCanonicalRouteForRole } from '@/lib/canonical-routes';
import { hasGitHubOAuthCredentials } from '@/lib/auth/social-providers';
import { resolveTenantContextFromRequest } from '@/lib/tenant/tenant-request';
import { FileText, Globe2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getLoginTenantBootstrapRedirect } from './_core';
import { createLoginEntryTiming } from './login-entry-timing';
import { SavedDraftSignInEntry } from './saved-draft-sign-in';

type LoginSearchParams = {
  tenantId?: string | string[];
  plan?: string | string[];
  next?: string | string[];
};

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<LoginSearchParams>;
};

// Duplicate query values are ambiguous continuation input, so only a single value is honored.
function readSingleQueryValue(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

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
  // Disabled by default; see login-entry-timing.ts for the bounded Preview activation contract.
  const timing = createLoginEntryTiming();
  try {
    const { locale } = await params;
    setRequestLocale(locale);

    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const tenantIdFromQuery = readSingleQueryValue(resolvedSearchParams?.tenantId);
    const planIdFromQuery = readSingleQueryValue(resolvedSearchParams?.plan);
    const nextPathFromQuery = readSingleQueryValue(resolvedSearchParams?.next);

    const endSessionPhase = timing.begin('session');
    const session = await getSessionSafe('LoginPage');
    endSessionPhase();
    timing.sessionResolved(Boolean(session));
    const sessionRole = session?.user?.role;
    if (sessionRole) {
      // An already-authenticated visit still honors a validated role-scoped continuation; the server
      // cannot read the request fragment, so client saved-draft hash handling stays in the form.
      const safeNextPath = resolveSafeNextPath(nextPathFromQuery, sessionRole, locale);
      if (safeNextPath) {
        timing.mark('redirect_requested');
        redirect(safeNextPath);
      }

      const canonical = getCanonicalRouteForRole(sessionRole, locale);
      if (canonical) {
        timing.mark('redirect_requested');
        redirect(canonical);
      }
    }

    // On an exact admitted neutral host there is no implicit tenant: the legacy resolver would hand
    // back the default public tenant (or a stale cookie), and that would be submitted as an implicit
    // hint that denies a normal login from another tenant. Every other host — country/pilot alias,
    // loopback, unknown, and any rejected neutral candidate — keeps its resolved context.
    const endTenantContextPhase = timing.begin('tenant_context');
    const neutralHostDecision = resolveNeutralEmailSignInHost(await headers());
    const tenantContext = await resolveTenantContextFromRequest();
    endTenantContextPhase();
    const tenantIdFromContext =
      neutralHostDecision === 'admitted' || tenantContext.kind !== 'tenant'
        ? null
        : tenantContext.tenantId;
    const bootstrapRedirect = getLoginTenantBootstrapRedirect({
      locale,
      tenantIdFromQuery,
      planIdFromQuery,
      nextPathFromQuery,
      tenantIdFromContext,
    });
    if (bootstrapRedirect) {
      timing.mark('redirect_requested');
      redirect(bootstrapRedirect);
    }

    // Neutral entry: returning customers submit credentials without choosing a country/tenant. Only a
    // deliberate host/context tenant is server-resolved here; a validated `tenantId` request stays on
    // the URL and the form carries it as explicit context itself. Keeping the two apart is what lets
    // the social onboarding intent stay `deferred` on the neutral entry and `resolved` on a country
    // host.
    const resolvedTenantId = tenantIdFromContext;

    const endTranslationsPhase = timing.begin('translations');
    const t = await getTranslations({ locale, namespace: 'auth.login' });
    endTranslationsPhase();

    const portalCopy: PortalCopy = {
      eyebrow: t('portal.eyebrow'),
      title: t('portal.title'),
      subtitle: t('portal.subtitle'),
      panelTitle: t('portal.panelTitle'),
      panelBody: t('portal.panelBody'),
      formRegionLabel: t('portal.formRegionLabel'),
      chips: [t('portal.chipSecure'), t('portal.chipStatus'), t('portal.chipDocuments')],
    };

    const page = (
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

            <SavedDraftSignInEntry locale={locale} />
            <LoginForm
              githubOAuthEnabled={hasGitHubOAuthCredentials()}
              tenantId={resolvedTenantId ?? undefined}
            />
          </section>
        </div>
      </main>
    );
    timing.mark('entry_returned');
    return page;
  } finally {
    timing.finishOnce();
  }
}
export { generateMetadata, generateViewport } from '@/app/_segment-exports';
