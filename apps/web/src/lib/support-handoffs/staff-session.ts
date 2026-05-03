import { and, db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

type StaffSupportSession = {
  user?: {
    branchId?: string | null;
    id?: string | null;
    role?: string | null;
    tenantId?: string | null;
  } | null;
};

export type StaffSupportSessionWithBranch<T extends StaffSupportSession> = T & {
  user: NonNullable<T['user']> & { branchId: string };
};

export async function resolveStaffSupportSessionBranch<T extends StaffSupportSession>(
  session: T | null | undefined
): Promise<StaffSupportSessionWithBranch<T> | null> {
  if (!session?.user) {
    return null;
  }

  const currentSession = session as T & { user: NonNullable<T['user']> };
  const role = currentSession.user.role;
  if (role !== 'staff' && role !== 'branch_manager') {
    return null;
  }

  const tenantId = currentSession.user.tenantId;
  const userId = currentSession.user.id;
  if (!tenantId || !userId) {
    return null;
  }

  if (currentSession.user?.branchId) {
    return currentSession as StaffSupportSessionWithBranch<T>;
  }

  const staffUser = await db.query.user.findFirst({
    where: withTenant(tenantId, user.tenantId, and(eq(user.id, userId), eq(user.role, role))),
    columns: { branchId: true },
  });

  if (!staffUser?.branchId) {
    return null;
  }

  return {
    ...currentSession,
    user: {
      ...currentSession.user,
      branchId: staffUser.branchId,
    },
  } as StaffSupportSessionWithBranch<T>;
}
