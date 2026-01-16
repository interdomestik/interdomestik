'use server';

import {
  getCashPendingFilter,
  getOpenClaimsFilter,
  getSlaBreachesFilter,
} from '@/features/admin/kpis/kpi-definitions';
import { runAuthenticatedAction, type ActionResult } from '@/lib/safe-action';
import { db } from '@interdomestik/database/db';
import { branches, claims, leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema';
import { ROLES } from '@interdomestik/shared-auth';
import * as Sentry from '@sentry/nextjs';
import { and, count, eq } from 'drizzle-orm';

export interface BranchWithKpis {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  kpis: {
    openClaims: number;
    cashPending: number;
    slaBreaches: number;
  };
}

export async function getBranchesWithKpis(): ActionResult<BranchWithKpis[]> {
  return runAuthenticatedAction<BranchWithKpis[]>(async ({ session }) => {
    return Sentry.withServerActionInstrumentation(
      'getBranchesWithKpis',
      { recordResponse: true },
      async () => {
        // 1. RBAC & Tenant Check
        const allowedRoles = [ROLES.super_admin, ROLES.admin, ROLES.tenant_admin];
        if (!allowedRoles.includes(session.user.role as any)) {
          throw new Error('Unauthorized');
        }

        const { tenantId } = session.user;
        if (!tenantId) {
          throw new Error('Tenant context required');
        }

        Sentry.setTag('tenantId', tenantId);
        Sentry.setTag('role', session.user.role);

        // 2. Mock Return for Debugging (REMOVED)

        // 2. Fetch all branches for this tenant (base list)
        const tenantBranches = await db
          .select({
            id: branches.id,
            name: branches.name,
            code: branches.code,
            isActive: branches.isActive,
          })
          .from(branches)
          .where(eq(branches.tenantId, tenantId))
          .orderBy(branches.name);

        if (tenantBranches.length === 0) {
          return [];
        }

        // 3. Aggregate Open Claims by Branch
        const openClaimsRaw = await db
          .select({
            branchId: claims.branchId,
            count: count(),
          })
          .from(claims)
          .where(and(eq(claims.tenantId, tenantId), getOpenClaimsFilter()))
          .groupBy(claims.branchId);

        // 4. Aggregate SLA Breaches by Branch
        const slaBreachesRaw = await db
          .select({
            branchId: claims.branchId,
            count: count(),
          })
          .from(claims)
          .where(and(eq(claims.tenantId, tenantId), getSlaBreachesFilter()))
          .groupBy(claims.branchId);

        // 5. Aggregate Cash Pending by Branch
        const cashPendingRaw = await db
          .select({
            branchId: memberLeads.branchId,
            count: count(),
          })
          .from(leadPaymentAttempts)
          .leftJoin(memberLeads, eq(leadPaymentAttempts.leadId, memberLeads.id))
          .where(and(eq(leadPaymentAttempts.tenantId, tenantId), getCashPendingFilter()))
          .groupBy(memberLeads.branchId);

        // 6. Merge Metrics
        const openClaimsMap = new Map(openClaimsRaw.map(r => [r.branchId, r.count]));
        const slaBreachesMap = new Map(slaBreachesRaw.map(r => [r.branchId, r.count]));
        const cashPendingMap = new Map(cashPendingRaw.map(r => [r.branchId, r.count]));

        return tenantBranches.map(branch => ({
          ...branch,
          kpis: {
            openClaims: openClaimsMap.get(branch.id) ?? 0,
            slaBreaches: slaBreachesMap.get(branch.id) ?? 0,
            cashPending: cashPendingMap.get(branch.id) ?? 0,
          },
        }));
      }
    );
  });
}
