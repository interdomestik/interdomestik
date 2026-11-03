import { and, eq, user } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export type StaffAssignmentOption = {
  id: string;
  label: string;
};

export async function getStaffAssignmentOptions(args: {
  branchId?: string | null;
  authority: TenantAuthority;
}): Promise<StaffAssignmentOption[]> {
  const { tenantId } = readTenantAuthority(args.authority);
  const scopedRole =
    args.branchId == null
      ? eq(user.role, 'staff')
      : and(eq(user.role, 'staff'), eq(user.branchId, args.branchId));

  const staff = await withTenantAuthority(args.authority, tx =>
    tx.query.user.findMany({
      columns: {
        email: true,
        id: true,
        name: true,
      },
      orderBy: (users, { asc }) => [asc(users.name), asc(users.email)],
      where: withTenant(tenantId, user.tenantId, scopedRole),
    })
  );

  return staff.map(member => ({
    id: member.id,
    label: member.name || member.email || member.id,
  }));
}
