/**
 * Route-local neutral single-entry decision for password sign-in.
 *
 * This module owns one question: on this request, does the owner-authorized neutral entry apply,
 * and in which of its states? Account comparison, auditing, rate limiting and the legacy
 * host/cookie tenant resolution stay with the auth route core, and credential, origin and session
 * verification stay with the provider.
 */
import type { TenantId } from '@/lib/tenant/tenant-hosts';

import { resolveNeutralEmailSignInHost } from './neutral-email-sign-in-admission';
import { resolveSignInTenantContext } from './sign-in-tenant-hint';

export type NeutralSingleEntryDecision =
  | { kind: 'delegate_to_provider' }
  | { kind: 'compare_explicit_tenant'; tenantId: TenantId }
  | { kind: 'reject' }
  | { kind: 'not_applicable' };

/**
 * Owner-authorized neutral single entry: a returning customer may submit normal credentials on an
 * exact admitted neutral host without first selecting a country/tenant.
 *
 * This supersedes only the historical missing-hint denial on those hosts. Explicit context is
 * parsed exactly once here:
 * - absent context delegates to the provider with no identity lookup;
 * - malformed or conflicting context is rejected rather than treated as absent;
 * - valid context is compared, as parsed, against the stored account tenant, with nothing
 *   re-deriving it from the host, cookies or the default public tenant.
 *
 * A neutral candidate host that is not an exact admitted entry is terminal, and a
 * compatibility-alias host (with or without the live-login cutover flag) is never a neutral
 * candidate at all.
 */
export function evaluateNeutralSingleEntryEmailSignIn(
  headers: Headers,
  body?: unknown
): NeutralSingleEntryDecision {
  const hostDecision = resolveNeutralEmailSignInHost(headers);
  if (hostDecision === 'rejected_neutral_candidate') return { kind: 'reject' };
  if (hostDecision === 'not_a_neutral_candidate') return { kind: 'not_applicable' };

  const explicitContext = resolveSignInTenantContext(headers, body);
  if (explicitContext.kind === 'absent') return { kind: 'delegate_to_provider' };
  if (explicitContext.kind === 'invalid') return { kind: 'reject' };

  return { kind: 'compare_explicit_tenant', tenantId: explicitContext.tenantId };
}
