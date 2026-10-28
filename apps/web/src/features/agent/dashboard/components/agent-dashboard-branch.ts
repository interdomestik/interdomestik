import { withTenantContext } from '@interdomestik/database';

export async function getAgentDashboardBranch(
  branchId: string | null | undefined,
  tenantId: string
) {
  return branchId
    ? withTenantContext({ tenantId }, tx =>
        tx.query.branches.findFirst({
          where: (fields, { and, eq }) =>
            and(eq(fields.id, branchId), eq(fields.tenantId, tenantId)),
          columns: { name: true },
        })
      )
    : null;
}
