import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
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
    .select({
      tenantId: claimTrackingTokens.tenantId,
      claimId: claimTrackingTokens.claimId,
      expiresAt: claimTrackingTokens.expiresAt,
      revokedAt: claimTrackingTokens.revokedAt,
    })
    .from(claimTrackingTokens)
    .where(eq(claimTrackingTokens.tokenHash, tokenHash))
    .limit(2);
  // The hash is unique per tenant only. Ambiguity is judged over every row with this hash, active
  // or not, so a hash present in two tenants never resolves; validity is checked afterwards.
  if (rows.length !== 1) return null;
  const [row] = rows;
  if (row.revokedAt || row.expiresAt.getTime() <= now.getTime()) return null;
  return { tenantId: row.tenantId, claimId: row.claimId };
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
