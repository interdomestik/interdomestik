import 'server-only';

import { isAdmin } from '@/lib/roles.core';
import { auditLog, user } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import * as Sentry from '@sentry/nextjs';
import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  ASSIGNMENT_AUDIT_ACTIONS,
  collectAssignmentUserIds,
  mapAssignmentAuditRows,
  type AssignmentTimelineEntry,
} from './claim-assignment-history';

/** Bounds the projection; a claim's assignment history stays far below this. */
export const ASSIGNMENT_HISTORY_LIMIT = 200;

/**
 * Existing assignment audit events of one claim for the admin claim history. Only the admin family
 * that the admin claim page admits reads them; every other principal gets none. The audit rows and
 * the handler names are read in the authority's tenant only. A failed read yields no entries, so
 * the status history still renders and no error detail reaches the page.
 */
export async function getClaimAssignmentHistory(params: {
  claimId: string;
  authority: TenantAuthority;
}): Promise<AssignmentTimelineEntry[]> {
  const { claimId, authority } = params;
  let tenantId: string | null = null;
  try {
    const granted = readTenantAuthority(authority);
    if (!isAdmin(granted.principal?.role)) return [];
    const scopeTenantId = granted.tenantId;
    tenantId = scopeTenantId;
    return await withTenantAuthority(authority, async tx => {
      // db-access-guard: tenant-scoped -- reason: tenant predicate built by withTenant from the authority tenant
      const rows = await tx
        .select({
          id: auditLog.id,
          action: auditLog.action,
          createdAt: auditLog.createdAt,
          actorId: auditLog.actorId,
          actorRole: auditLog.actorRole,
          metadata: auditLog.metadata,
        })
        .from(auditLog)
        .where(
          withTenant(
            scopeTenantId,
            auditLog.tenantId,
            and(
              eq(auditLog.entityType, 'claim'),
              eq(auditLog.entityId, claimId),
              inArray(auditLog.action, ASSIGNMENT_AUDIT_ACTIONS)
            )
          )
        )
        .orderBy(asc(auditLog.createdAt), asc(auditLog.id))
        .limit(ASSIGNMENT_HISTORY_LIMIT);

      const userIds = collectAssignmentUserIds(rows);
      if (userIds.length === 0) return mapAssignmentAuditRows(rows, new Map());

      // db-access-guard: tenant-scoped -- reason: tenant predicate built by withTenant from the authority tenant
      const people = await tx
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(withTenant(scopeTenantId, user.tenantId, inArray(user.id, userIds)));

      return mapAssignmentAuditRows(rows, new Map(people.map(person => [person.id, person.name])));
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { domain: 'claims', operation: 'getClaimAssignmentHistory' },
      extra: { claimId, tenantId },
    });
    return [];
  }
}
