import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { dbAdmin } from './db';
import { npsSurveyTokens } from './schema/automation';
import { sharePacks } from './schema/documents';
import { sponsorRosterEntries } from './schema/sponsor-roster';
import { claimTrackingTokens } from './schema/tracking';
import { mintTenantAuthority, type TenantAuthority } from './tenant-authority';

// The authority is the public-token producer's grant: minted only after one exact token resolved
// to one tenant, carrying no principal. It is scoped to that tenant, never to a session.
export type ClaimTrackingTokenTenant = {
  tenantId: string;
  claimId: string;
  authority: TenantAuthority;
};
export type NpsSurveyTokenTenant = { tenantId: string; authority: TenantAuthority };
export type SharePackTenant = { tenantId: string; authority: TenantAuthority };
export type SponsorOptOutTenant = { tenantId: string; entryId: string; authority: TenantAuthority };

function mintPublicTokenAuthority(tenantId: string): TenantAuthority {
  return mintTenantAuthority({ tenantId, purpose: 'public-token' });
}

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
  return {
    tenantId: row.tenantId,
    claimId: row.claimId,
    authority: mintPublicTokenAuthority(row.tenantId),
  };
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
  return { tenantId: rows[0].tenantId, authority: mintPublicTokenAuthority(rows[0].tenantId) };
}

/**
 * Resolves the tenant of one live share pack named by a share token the caller has already verified.
 * The pack id is only the signed token's claim, so the stored pack must exist exactly once, belong
 * to the tenant the token also names, and be neither revoked nor expired. Only the share-pack
 * service, which verifies the token signature first, may call this.
 */
export async function resolveSharePackTenant(
  packId: string,
  tokenTenantId: string,
  now: Date
): Promise<SharePackTenant | null> {
  if (!packId || !tokenTenantId) return null;
  // db-access-guard: system-exempt -- reason: exact signed share-pack id to tenant resolution only; documents stay tenant-scoped
  const rows = await dbAdmin
    .select({
      tenantId: sharePacks.tenantId,
      expiresAt: sharePacks.expiresAt,
      revokedAt: sharePacks.revokedAt,
    })
    .from(sharePacks)
    .where(eq(sharePacks.id, packId))
    .limit(2);
  if (rows.length !== 1) return null;
  const [row] = rows;
  if (row.tenantId !== tokenTenantId) return null;
  if (row.revokedAt || row.expiresAt.getTime() <= now.getTime()) return null;
  return { tenantId: row.tenantId, authority: mintPublicTokenAuthority(row.tenantId) };
}

/**
 * ACQ-3b §3.8: resolves the tenant and roster entry of one sponsor opt-out link. The caller passes
 * the hash of the presented token (the token is derived, never stored). A hash present on more
 * than one row never resolves; the opt-out itself re-reads the entry and acts only on its own
 * person and sponsor inside the tenant transaction. A cleared hash (revoked, or 30 days after the
 * term ended) cannot match.
 */
export async function resolveSponsorOptOutTenant(
  tokenHash: string
): Promise<SponsorOptOutTenant | null> {
  if (!tokenHash) return null;
  // db-access-guard: system-exempt -- reason: exact opt-out token hash to tenant/entry resolution only; the opt-out stays tenant-scoped
  const rows = await dbAdmin
    .select({ tenantId: sponsorRosterEntries.tenantId, entryId: sponsorRosterEntries.id })
    .from(sponsorRosterEntries)
    .where(eq(sponsorRosterEntries.optoutTokenHash, tokenHash))
    .limit(2);
  if (rows.length !== 1) return null;
  const [row] = rows;
  return {
    tenantId: row.tenantId,
    entryId: row.entryId,
    authority: mintPublicTokenAuthority(row.tenantId),
  };
}
