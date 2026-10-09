// v2.0.2-admin-claims-ops — Lifecycle Stats Query
import { withTenantContext, type TenantTransaction } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { claims } from '@interdomestik/database/schema';
import { claimLifecycleStatusIn } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import * as Sentry from '@sentry/nextjs';
import { and, count, sql } from 'drizzle-orm';

import { matchesAccessTenant } from '@/lib/db/access-tenant-predicate';

import type { LifecycleStats } from '../types';
import { adminClaimsBranchCondition, type ClaimsVisibilityContext } from './claimVisibility';

const INTAKE_STATUSES: ClaimStatus[] = ['draft', 'submitted'];
const VERIFICATION_STATUSES: ClaimStatus[] = ['verification'];
const PROCESSING_STATUSES: ClaimStatus[] = ['evaluation'];
const NEGOTIATION_STATUSES: ClaimStatus[] = ['negotiation'];
const LEGAL_STATUSES: ClaimStatus[] = ['court'];
const COMPLETED_STATUSES: ClaimStatus[] = ['resolved', 'rejected'];

/**
 * Reads claim counts per lifecycle stage inside the caller's tenant transaction.
 * Claims are scoped by effective access tenant (home tenant only when access is unset).
 * Errors propagate to the caller.
 */
export async function readAdminClaimStats(
  tx: TenantTransaction,
  context: ClaimsVisibilityContext
): Promise<LifecycleStats> {
  // db-access-guard: tenant-scoped -- reason: explicit access-tenant and branch predicates; callers supply their withTenantContext transaction
  const [result] = await tx
    .select({
      intake: count(sql`CASE WHEN ${claimLifecycleStatusIn(INTAKE_STATUSES)} THEN 1 END`),
      verification: count(
        sql`CASE WHEN ${claimLifecycleStatusIn(VERIFICATION_STATUSES)} THEN 1 END`
      ),
      processing: count(sql`CASE WHEN ${claimLifecycleStatusIn(PROCESSING_STATUSES)} THEN 1 END`),
      negotiation: count(sql`CASE WHEN ${claimLifecycleStatusIn(NEGOTIATION_STATUSES)} THEN 1 END`),
      legal: count(sql`CASE WHEN ${claimLifecycleStatusIn(LEGAL_STATUSES)} THEN 1 END`),
      completed: count(sql`CASE WHEN ${claimLifecycleStatusIn(COMPLETED_STATUSES)} THEN 1 END`),
    })
    .from(claims)
    .where(and(matchesAccessTenant(claims, context.tenantId), adminClaimsBranchCondition(context)));

  return {
    intake: Number(result?.intake ?? 0),
    verification: Number(result?.verification ?? 0),
    processing: Number(result?.processing ?? 0),
    negotiation: Number(result?.negotiation ?? 0),
    legal: Number(result?.legal ?? 0),
    completed: Number(result?.completed ?? 0),
  };
}

/**
 * Gets claim counts per lifecycle stage.
 * Used for tab badge counts.
 */
export async function getAdminClaimStats(
  context: ClaimsVisibilityContext
): Promise<LifecycleStats> {
  try {
    return await withTenantContext({ tenantId: context.tenantId, role: context.role }, tx =>
      readAdminClaimStats(tx, context)
    );
  } catch (error) {
    Sentry.captureException(error, {
      extra: { tenantId: context.tenantId, action: 'getAdminClaimStats' },
    });
    // Return zeros on error
    return {
      intake: 0,
      verification: 0,
      processing: 0,
      negotiation: 0,
      legal: 0,
      completed: 0,
    };
  }
}
