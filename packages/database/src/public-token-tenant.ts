import { createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { dbAdmin } from './db';
import { npsSurveyTokens } from './schema/automation';
import { claimTrackingTokens } from './schema/tracking';

export type ClaimTrackingTokenTenant = { tenantId: string; claimId: string };
export type NpsSurveyTokenTenant = { tenantId: string };

// Token tables are tenant-isolated, so an unauthenticated bearer cannot be resolved under the
// restricted runtime role. These fixed lookups return only the tenant (and bound claim) for one
// exact token; callers must re-read and enforce validity inside withTenantContext before any
// effect. Results are internal and must never be returned to the public caller.

export async function resolveClaimTrackingTokenTenant(
  rawToken: string,
  now: Date
): Promise<ClaimTrackingTokenTenant | null> {
  if (!rawToken) return null;
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  // db-access-guard: system-exempt -- reason: exact bearer-hash tracking token to tenant/claim resolution only; no claim data
  const rows = await dbAdmin
    .select({ tenantId: claimTrackingTokens.tenantId, claimId: claimTrackingTokens.claimId })
    .from(claimTrackingTokens)
    .where(
      and(
        eq(claimTrackingTokens.tokenHash, tokenHash),
        gt(claimTrackingTokens.expiresAt, now),
        isNull(claimTrackingTokens.revokedAt)
      )
    )
    .limit(2);
  // The hash is unique per tenant only; an ambiguous match resolves to nothing.
  if (rows.length !== 1) return null;
  return { tenantId: rows[0].tenantId, claimId: rows[0].claimId };
}

export async function resolveNpsSurveyTokenTenant(
  rawToken: string
): Promise<NpsSurveyTokenTenant | null> {
  if (!rawToken) return null;
  // db-access-guard: system-exempt -- reason: exact NPS survey token to tenant resolution only; validity and consumption stay tenant-scoped
  const rows = await dbAdmin
    .select({ tenantId: npsSurveyTokens.tenantId })
    .from(npsSurveyTokens)
    .where(eq(npsSurveyTokens.token, rawToken))
    .limit(2);
  if (rows.length !== 1) return null;
  return { tenantId: rows[0].tenantId };
}
