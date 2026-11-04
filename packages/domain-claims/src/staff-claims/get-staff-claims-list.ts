import { and, claimStageHistory, claims, desc, eq, inArray, user } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { aliasedTable } from 'drizzle-orm';
import type { DiasporaOriginFilter } from '../claims/diaspora-origin-filter';
import { claimLifecycleStatusSql } from '../claims/lifecycle-read-sql';
import { buildValidDiasporaOriginNoteCondition } from './staff-claims-diaspora-origin-notes';
import {
  buildStaffClaimsListConditions,
  type StaffClaimsAssignmentFilter,
} from './staff-claims-list-filters';
import { mapStaffClaimsListRows, type StaffClaimsListItem } from './staff-claims-list-mapper';
import { resolveStaffClaimReader } from './reader-policy';

export type { StaffClaimsAssignmentFilter, StaffClaimsListItem };

/**
 * The staff queue for the reader the authority grants. Null when the authority grants no staff
 * claim reader; no query runs then. Filters only narrow the reader's queue.
 */
export async function getStaffClaimsList(params: {
  authority: TenantAuthority;
  assignment?: StaffClaimsAssignmentFilter;
  diasporaOrigin?: DiasporaOriginFilter;
  limit: number;
  search?: string;
  status?: string;
}): Promise<StaffClaimsListItem[] | null> {
  const { authority, assignment = 'all', diasporaOrigin = 'all', limit, search, status } = params;
  const reader = resolveStaffClaimReader(authority);
  if (!reader) return null;
  const { tenantId } = reader;
  const assignee = aliasedTable(user, 'assignee');

  const { rows, historyRows } = await withTenantAuthority(authority, async tx => {
    const conditions = buildStaffClaimsListConditions({
      assignment,
      authority,
      diasporaOrigin,
      search,
      status,
      tx,
    });
    const scopedWhere = withTenant(tenantId, claims.tenantId, and(...conditions));
    // db-access-guard: tenant-scoped -- reason: scopedWhere is consumed under RLS context
    const rows = await tx
      .select({
        id: claims.id,
        claimNumber: claims.claimNumber,
        companyName: claims.companyName,
        title: claims.title,
        status: claimLifecycleStatusSql(),
        caseLifecycleState: claims.caseLifecycleState,
        recoveryLifecycleState: claims.recoveryLifecycleState,
        staffId: claims.staffId,
        assigneeName: assignee.name,
        assigneeEmail: assignee.email,
        updatedAt: claims.updatedAt,
        memberName: user.name,
        memberNumber: user.memberNumber,
      })
      .from(claims)
      .leftJoin(user, eq(claims.userId, user.id))
      .leftJoin(assignee, eq(claims.staffId, assignee.id))
      .where(scopedWhere)
      .orderBy(desc(claims.updatedAt), desc(claims.id))
      .limit(limit);

    const claimIds = rows.map(row => row.id);
    if (claimIds.length === 0) return { rows, historyRows: [] };

    // db-access-guard: tenant-scoped -- reason: scoped by tenant + the page's claim ids under RLS context
    const historyRows = await tx
      .selectDistinctOn([claimStageHistory.claimId], {
        claimId: claimStageHistory.claimId,
        note: claimStageHistory.note,
      })
      .from(claimStageHistory)
      .where(
        withTenant(
          tenantId,
          claimStageHistory.tenantId,
          and(
            inArray(claimStageHistory.claimId, claimIds),
            buildValidDiasporaOriginNoteCondition(claimStageHistory.note)
          )
        )
      )
      .orderBy(
        claimStageHistory.claimId,
        desc(claimStageHistory.createdAt),
        desc(claimStageHistory.id)
      );

    return { rows, historyRows };
  });

  return mapStaffClaimsListRows(rows, historyRows);
}
