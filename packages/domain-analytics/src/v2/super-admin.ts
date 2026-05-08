import { db } from '@interdomestik/database';
import { branches, claims, tenants, user } from '@interdomestik/database/schema';
import { count, eq, sql } from 'drizzle-orm';

export interface SuperAdminKPIs {
  totalTenants: number;
  totalBranches: number;
  totalStaff: number;
  totalAgents: number;
  totalMembers: number;
  claimsMetrics: {
    total: number;
    today: number;
    last7d: number;
    last30d: number;
  };
}

export async function getSuperAdminKPIs(): Promise<SuperAdminKPIs> {
  const [
    tenantCount,
    branchCount,
    staffCount,
    agentCount,
    memberCount,
    claimsTotal,
    claimsToday,
    claims7d,
    claims30d,
  ] = await Promise.all([
    // db-access-guard: system-exempt -- reason: intentionally cross-tenant analytics aggregate reviewed for SEC04B
    db.select({ count: count() }).from(tenants),
    // db-access-guard: system-exempt -- reason: intentionally cross-tenant analytics aggregate reviewed for SEC04B
    db.select({ count: count() }).from(branches),
    // db-access-guard: system-exempt -- reason: intentionally cross-tenant analytics aggregate reviewed for SEC04B
    db.select({ count: count() }).from(user).where(eq(user.role, 'staff')),
    // db-access-guard: system-exempt -- reason: intentionally cross-tenant analytics aggregate reviewed for SEC04B
    db.select({ count: count() }).from(user).where(eq(user.role, 'agent')),
    // db-access-guard: system-exempt -- reason: intentionally cross-tenant analytics aggregate reviewed for SEC04B
    db.select({ count: count() }).from(user).where(eq(user.role, 'member')),
    // db-access-guard: system-exempt -- reason: intentionally cross-tenant analytics aggregate reviewed for SEC04B
    db.select({ count: count() }).from(claims),
    // db-access-guard: system-exempt -- reason: intentionally cross-tenant analytics aggregate reviewed for SEC04B
    db
      .select({ count: count() })
      .from(claims)
      .where(sql`created_at >= NOW() - INTERVAL '1 day'`),
    // db-access-guard: system-exempt -- reason: intentionally cross-tenant analytics aggregate reviewed for SEC04B
    db
      .select({ count: count() })
      .from(claims)
      .where(sql`created_at >= NOW() - INTERVAL '7 days'`),
    // db-access-guard: system-exempt -- reason: intentionally cross-tenant analytics aggregate reviewed for SEC04B
    db
      .select({ count: count() })
      .from(claims)
      .where(sql`created_at >= NOW() - INTERVAL '30 days'`),
  ]);

  return {
    totalTenants: tenantCount[0].count,
    totalBranches: branchCount[0].count,
    totalStaff: staffCount[0].count,
    totalAgents: agentCount[0].count,
    totalMembers: memberCount[0].count,
    claimsMetrics: {
      total: claimsTotal[0].count,
      today: claimsToday[0].count,
      last7d: claims7d[0].count,
      last30d: claims30d[0].count,
    },
  };
}
