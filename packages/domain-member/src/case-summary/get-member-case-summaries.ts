import { withTenantContext } from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import { claimDocuments, claims } from '@interdomestik/database/schema';
import { and, asc, count, eq, sql } from 'drizzle-orm';

import type { CaseLifecycleStatus, CaseSummary, NextStepToken } from './types';

const NEXT_STEP = {
  draft: 'member_action',
  submitted: 'team_review',
  submitted_to_airline: 'external_response',
  verification: 'team_review',
  evaluation: 'team_review',
  negotiation: 'external_response',
  court: 'court_schedule',
  resolved: 'complete',
  rejected: 'complete',
} as const satisfies Record<CaseLifecycleStatus, NextStepToken>;

export async function getMemberCaseSummaries(params: {
  memberId: string;
  tenantId: string;
}): Promise<CaseSummary[]> {
  const { memberId, tenantId } = params;
  if (!tenantId) throw new Error('Missing tenant context');

  return withTenantContext({ tenantId, role: 'member' }, async tx => {
    // db-access-guard: tenant-scoped -- reason: explicit tenant/member predicates inside RLS context
    const rows = await tx
      .select({
        id: claims.id,
        reference: claims.claimNumber,
        caseLifecycleState: claims.caseLifecycleState,
        recoveryLifecycleState: claims.recoveryLifecycleState,
        documentCount: count(claimDocuments.id),
      })
      .from(claims)
      .leftJoin(
        claimDocuments,
        and(eq(claimDocuments.claimId, claims.id), eq(claimDocuments.tenantId, tenantId))
      )
      .where(
        and(
          eq(claims.tenantId, tenantId),
          eq(claims.userId, memberId),
          eq(claims.category, 'vehicle')
        )
      )
      .groupBy(
        claims.id,
        claims.claimNumber,
        claims.caseLifecycleState,
        claims.recoveryLifecycleState,
        claims.createdAt,
        claims.updatedAt
      )
      .orderBy(
        sql`coalesce(${claims.updatedAt}, ${claims.createdAt}) desc nulls last`,
        asc(claims.id)
      );

    return rows.map(row => {
      const status = claimStatusFromLifecycleFields(row);
      return {
        caseKind: 'accident',
        id: row.id,
        reference: row.reference,
        status,
        documentCount: Number(row.documentCount),
        nextStep: NEXT_STEP[status],
      };
    });
  });
}
