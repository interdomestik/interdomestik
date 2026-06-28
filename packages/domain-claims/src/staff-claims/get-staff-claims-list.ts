import {
  and,
  claimStageHistory,
  claims,
  desc,
  eq,
  inArray,
  user,
  withTenantContext,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { aliasedTable } from 'drizzle-orm';
import type { DiasporaOriginFilter } from '../claims/diaspora-origin-filter';
import {
  buildStaffClaimsListConditions,
  type StaffClaimsAssignmentFilter,
} from './staff-claims-list-filters';
import { mapStaffClaimsListRows, type StaffClaimsListItem } from './staff-claims-list-mapper';

export type { StaffClaimsAssignmentFilter };

export async function getStaffClaimsList(params: {
  staffId: string;
  tenantId: string;
  branchId?: string | null;
  assignment?: StaffClaimsAssignmentFilter;
  diasporaOrigin?: DiasporaOriginFilter;
  limit: number;
  search?: string;
  status?: string;
  viewerRole?: string | null;
}): Promise<StaffClaimsListItem[]> {
  const {
    staffId,
    tenantId,
    branchId,
    assignment = 'all',
    diasporaOrigin = 'all',
    limit,
    search,
    status,
    viewerRole,
  } = params;
  const conditions = buildStaffClaimsListConditions({
    assignment,
    branchId,
    diasporaOrigin,
    search,
    staffId,
    status,
    tenantId,
    viewerRole,
  });
  const scopedWhere = withTenant(tenantId, claims.tenantId, and(...conditions));
  const assignee = aliasedTable(user, 'assignee');

  const { rows, historyRows } = await withTenantContext(
    { tenantId, role: viewerRole },
    async tx => {
      // db-access-guard: tenant-scoped -- reason: scopedWhere is consumed under RLS context
      const rows = await tx
        .select({
          id: claims.id,
          claimNumber: claims.claimNumber,
          companyName: claims.companyName,
          title: claims.title,
          status: claims.status,
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

      const historyRows = await tx
        .select({
          claimId: claimStageHistory.claimId,
          note: claimStageHistory.note,
        })
        .from(claimStageHistory)
        .where(
          withTenant(
            tenantId,
            claimStageHistory.tenantId,
            inArray(claimStageHistory.claimId, claimIds)
          )
        )
        .orderBy(desc(claimStageHistory.createdAt), desc(claimStageHistory.id));

      return { rows, historyRows };
    }
  );

  return mapStaffClaimsListRows(rows, historyRows);
}
