import { sanitizeInternalContinuationPath } from '@/components/auth/login-next-path';
import { coerceTenantId } from '@/lib/tenant/tenant-hosts';

function coercePlanId(
  planId: string | null | undefined
): 'standard' | 'family' | 'business' | null {
  if (!planId) return null;
  const normalized = planId.trim().toLowerCase();
  if (normalized === 'standard' || normalized === 'family' || normalized === 'business') {
    return normalized;
  }
  return null;
}

function buildLoginReturnPath(args: {
  locale: string;
  planId: 'standard' | 'family' | 'business' | null;
  nextPath: string | null;
}): string {
  const { locale, planId, nextPath } = args;
  const params = new URLSearchParams();
  if (planId) params.set('plan', planId);
  if (nextPath) params.set('next', nextPath);
  const query = params.toString();
  return query ? `/${locale}/login?${query}` : `/${locale}/login`;
}

export function getLoginTenantBootstrapRedirect(args: {
  locale: string;
  tenantIdFromQuery?: string | null;
  planIdFromQuery?: string | null;
  nextPathFromQuery?: string | null;
  tenantIdFromContext?: string | null;
}): string | null {
  const { locale, tenantIdFromQuery, planIdFromQuery, nextPathFromQuery, tenantIdFromContext } =
    args;
  const queryTenantId = coerceTenantId(tenantIdFromQuery ?? undefined);
  if (!queryTenantId) return null;
  // The neutral public entry has no cookie-backed tenant authority: request resolution returns a
  // public context on a front-door host and ignores the tenant cookie. A bootstrap round trip there
  // would either drop the deliberate query (leaving the submission with no validated context) or
  // repeat forever, so the validated query tenant is carried straight into the form instead.
  if (!coerceTenantId(tenantIdFromContext ?? undefined)) return null;
  if (tenantIdFromContext === queryTenantId) return null;

  const nextPath = buildLoginReturnPath({
    locale,
    planId: coercePlanId(planIdFromQuery ?? null),
    nextPath: sanitizeInternalContinuationPath(nextPathFromQuery)?.target ?? null,
  });

  const params = new URLSearchParams({
    tenantId: queryTenantId,
    next: nextPath,
  });
  return `/${locale}/login/tenant-context?${params.toString()}`;
}
