// v2.0.2-admin-claims-ops — Lifecycle Stats Query
import { db } from '@interdomestik/database';
import { claims } from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import { count, eq, inArray, sql } from 'drizzle-orm';

import type { LifecycleStats } from '../types';
import type { ClaimsVisibilityContext } from './claimVisibility';

const INTAKE_STATUSES = ['draft', 'submitted'] as const;
const VERIFICATION_STATUSES = ['verification'] as const;
const PROCESSING_STATUSES = ['evaluation'] as const;
const NEGOTIATION_STATUSES = ['negotiation'] as const;
const LEGAL_STATUSES = ['court'] as const;
const COMPLETED_STATUSES = ['resolved', 'rejected'] as const;

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
        intake: count(sql`CASE WHEN ${inArray(claims.status, [...INTAKE_STATUSES])} THEN 1 END`),
        verification: count(
          sql`CASE WHEN ${inArray(claims.status, [...VERIFICATION_STATUSES])} THEN 1 END`
        ),
        processing: count(
          sql`CASE WHEN ${inArray(claims.status, [...PROCESSING_STATUSES])} THEN 1 END`
        ),
        negotiation: count(
          sql`CASE WHEN ${inArray(claims.status, [...NEGOTIATION_STATUSES])} THEN 1 END`
        ),
        legal: count(sql`CASE WHEN ${inArray(claims.status, [...LEGAL_STATUSES])} THEN 1 END`),
        completed: count(
          sql`CASE WHEN ${inArray(claims.status, [...COMPLETED_STATUSES])} THEN 1 END`
        ),
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
