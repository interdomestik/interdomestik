import { and, withTenantContext, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

export async function getAssignableStaff(args: { branchId: string | null; tenantId: string }) {
  return withTenantContext({ tenantId: args.tenantId }, tx =>
    tx.query.user.findMany({
      where: withTenant(
        args.tenantId,
        user.tenantId,
        args.branchId
          ? and(eq(user.role, 'staff'), eq(user.branchId, args.branchId))
          : eq(user.role, 'staff')
      ),
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    })
  );
}
