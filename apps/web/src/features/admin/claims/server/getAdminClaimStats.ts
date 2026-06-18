// v2.0.2-admin-claims-ops — Lifecycle Stats Query
import { db } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { claims } from '@interdomestik/database/schema';
import { claimLifecycleStatusIn } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import * as Sentry from '@sentry/nextjs';
import { count, eq, sql } from 'drizzle-orm';

import type { LifecycleStats } from '../types';
import type { ClaimsVisibilityContext } from './claimVisibility';

const INTAKE_STATUSES: ClaimStatus[] = ['draft', 'submitted'];
const VERIFICATION_STATUSES: ClaimStatus[] = ['verification'];
const PROCESSING_STATUSES: ClaimStatus[] = ['evaluation'];
const NEGOTIATION_STATUSES: ClaimStatus[] = ['negotiation'];
const LEGAL_STATUSES: ClaimStatus[] = ['court'];
const COMPLETED_STATUSES: ClaimStatus[] = ['resolved', 'rejected'];

/**
 * Gets claim counts per lifecycle stage.
 * Used for tab badge counts.
 */
export async function getAdminClaimStats(
  context: ClaimsVisibilityContext
): Promise<LifecycleStats> {
  try {
    const [result] = await db
      .select({
        intake: count(sql`CASE WHEN ${claimLifecycleStatusIn(INTAKE_STATUSES)} THEN 1 END`),
        verification: count(
          sql`CASE WHEN ${claimLifecycleStatusIn(VERIFICATION_STATUSES)} THEN 1 END`
        ),
        processing: count(sql`CASE WHEN ${claimLifecycleStatusIn(PROCESSING_STATUSES)} THEN 1 END`),
        negotiation: count(
          sql`CASE WHEN ${claimLifecycleStatusIn(NEGOTIATION_STATUSES)} THEN 1 END`
        ),
        legal: count(sql`CASE WHEN ${claimLifecycleStatusIn(LEGAL_STATUSES)} THEN 1 END`),
        completed: count(sql`CASE WHEN ${claimLifecycleStatusIn(COMPLETED_STATUSES)} THEN 1 END`),
      })
      .from(claims)
      .where(eq(claims.tenantId, context.tenantId));

    return {
      intake: Number(result?.intake ?? 0),
      verification: Number(result?.verification ?? 0),
      processing: Number(result?.processing ?? 0),
      negotiation: Number(result?.negotiation ?? 0),
      legal: Number(result?.legal ?? 0),
      completed: Number(result?.completed ?? 0),
    };
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
