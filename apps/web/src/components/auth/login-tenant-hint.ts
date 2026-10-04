const TENANT_IDS = new Set(['tenant_mk', 'tenant_ks', 'tenant_al', 'pilot-mk']);

function coerceTenantHint(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  return TENANT_IDS.has(normalized) ? normalized : undefined;
}

/**
 * Resolves the deliberate tenant context a password login submission may carry: the
 * host/page-resolved tenant, or an explicit `tenantId` request.
 *
 * `default_booking_tenant_id` is booking context, not identity authority, so it is deliberately
 * not promoted here. At the neutral entry the authenticated identity owns tenant selection. Social
 * sign-up/onboarding keeps its own booking context through
 * {@link resolveSocialOnboardingTenantContext}.
 */
export function resolveLoginTenantHint(
  searchParams: Pick<URLSearchParams, 'get'>,
  explicitTenantId?: string
): string | undefined {
  return coerceTenantHint(explicitTenantId) ?? coerceTenantHint(searchParams.get('tenantId'));
}

export type SocialOnboardingTenantContext = {
  tenantId: string;
  /** True when the tenant came from a request hint rather than server-resolved page context. */
  deferred: boolean;
};

/**
 * Resolves the onboarding tenant context a social (GitHub) sign-up may carry. This is a separate
 * decision from password identity: a new social account still needs a validated onboarding intent,
 * so a redirected booking context remains usable here even though it never selects a password
 * identity. Server-resolved page context keeps precedence and marks the intent resolved; a request
 * hint is carried as deferred so classification stays pending.
 */
export function resolveSocialOnboardingTenantContext(
  searchParams: Pick<URLSearchParams, 'get'>,
  explicitTenantId?: string
): SocialOnboardingTenantContext | null {
  const resolved = coerceTenantHint(explicitTenantId);
  if (resolved) return { tenantId: resolved, deferred: false };

  const requested =
    coerceTenantHint(searchParams.get('tenantId')) ??
    coerceTenantHint(searchParams.get('default_booking_tenant_id'));

  return requested ? { tenantId: requested, deferred: true } : null;
}
