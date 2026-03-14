import { and, db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

export type StaffAssignmentOption = {
  id: string;
  label: string;
};

export async function getStaffAssignmentOptions(args: {
  branchId?: string | null;
  tenantId: string;
}): Promise<StaffAssignmentOption[]> {
  const scopedRole =
    args.branchId == null
      ? eq(user.role, 'staff')
      : and(eq(user.role, 'staff'), eq(user.branchId, args.branchId));

  const staff = await db.query.user.findMany({
    columns: {
      email: true,
      id: true,
      name: true,
    },
    orderBy: (users, { asc }) => [asc(users.name), asc(users.email)],
    where: withTenant(args.tenantId, user.tenantId, scopedRole),
  });

  return staff.map(member => ({
    id: member.id,
    label: member.name || member.email || member.id,
  }));
}
