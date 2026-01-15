// v2.0.2-admin-claims-ops — Main V2 List Loader
import { db } from '@interdomestik/database';
import { branches, claims, user } from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import { aliasedTable, and, count, desc, eq, ilike, inArray, or, SQL } from 'drizzle-orm';

import { mapClaimsToOperationalRows, type RawClaimRow } from '../mappers';
import type { AdminClaimsV2Filters, AdminClaimsV2Response, LifecycleStage } from '../types';
import type { ClaimsVisibilityContext } from './claimVisibility';
import { getAdminClaimStats } from './getAdminClaimStats';

const LIFECYCLE_STATUS_MAP: Record<LifecycleStage, string[]> = {
  intake: ['draft', 'submitted'],
  verification: ['verification'],
  processing: ['evaluation'],
  negotiation: ['negotiation'],
  legal: ['court'],
  completed: ['resolved', 'rejected'],
};

function buildConditions(context: ClaimsVisibilityContext, filters: AdminClaimsV2Filters): SQL[] {
  const { tenantId, role, branchId, userId } = context;
  const conditions: SQL[] = [eq(claims.tenantId, tenantId)];

  // Role-based scoping
  if (role === 'branch_manager' && branchId) {
    conditions.push(eq(claims.branchId, branchId));
  } else if (role === 'staff') {
    if (branchId) {
      conditions.push(or(eq(claims.branchId, branchId), eq(claims.staffId, userId))!);
    } else {
      conditions.push(eq(claims.staffId, userId));
    }
  }
  // admin/tenant_admin/super_admin see all in tenant

  // Lifecycle filter
  if (filters.lifecycleStage) {
    const statuses = LIFECYCLE_STATUS_MAP[filters.lifecycleStage];
    if (statuses && statuses.length > 0) {
      conditions.push(inArray(claims.status, statuses as any));
    }
  }

  // Search filter
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(claims.title, pattern),
        ilike(claims.id, pattern),
        ilike(user.email, pattern),
        ilike(user.name, pattern)
      )!
    );
  }

  return conditions;
}

/**
 * Main V2 list loader.
 * Returns UI-ready operational DTOs with lifecycle stats.
 */
export async function getAdminClaimsV2(
  context: ClaimsVisibilityContext,
  filters: AdminClaimsV2Filters = {}
): Promise<AdminClaimsV2Response> {
  const page = filters.page ?? 1;
  const perPage = filters.perPage ?? 20;
  const offset = (page - 1) * perPage;

  try {
    const conditions = buildConditions(context, filters);
    const staff = aliasedTable(user, 'staff');

    // Main data query
    const rawRows = await db
      .select({
        claim: {
          id: claims.id,
          claimNumber: claims.claimNumber,
          userId: claims.userId,
          title: claims.title,
          status: claims.status,
          createdAt: claims.createdAt,
          updatedAt: claims.updatedAt,
          assignedAt: claims.assignedAt,
          category: claims.category,
          currency: claims.currency,
        },
        claimant: {
          name: user.name,
          email: user.email,
        },
        staff: {
          name: staff.name,
          email: staff.email,
        },
        branch: {
          id: branches.id,
          code: branches.code,
          name: branches.name,
        },
      })
      .from(claims)
      .leftJoin(user, eq(claims.userId, user.id))
      .leftJoin(staff, eq(claims.staffId, staff.id))
      .leftJoin(branches, eq(claims.branchId, branches.id))
      .where(and(...conditions))
      .orderBy(desc(claims.createdAt))
      .limit(perPage)
      .offset(offset);

    // Map to operational rows
    const rows = mapClaimsToOperationalRows(rawRows as RawClaimRow[]);

    // Get stats (separate query for all lifecycle counts)
    const stats = await getAdminClaimStats(context);

    // Total count for pagination (with filters applied)
    const [{ totalCount }] = await db
      .select({ totalCount: count() })
      .from(claims)
      .leftJoin(user, eq(claims.userId, user.id))
      .where(and(...conditions));

    return {
      rows,
      stats,
      pagination: {
        page,
        perPage,
        totalCount: Number(totalCount ?? 0),
        totalPages: Math.ceil(Number(totalCount ?? 0) / perPage),
      },
    };
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        tenantId: context.tenantId,
        action: 'getAdminClaimsV2',
        filters,
      },
    });
    // Return empty result on error
    return {
      rows: [],
      stats: { intake: 0, verification: 0, processing: 0, negotiation: 0, legal: 0, completed: 0 },
      pagination: { page, perPage, totalCount: 0, totalPages: 0 },
    };
  }
}
