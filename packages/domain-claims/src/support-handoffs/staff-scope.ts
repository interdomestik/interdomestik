import { eq, supportHandoffs } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import type { SupportHandoffSession } from './types';
type StaffUser = SupportHandoffSession['user'] & { branchId?: string | null };

export function requireStaffSession(session: SupportHandoffSession | null) {
  if (session?.user?.role !== 'staff') {
    return null;
  }

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return null;
  }

  const user = session.user as StaffUser;
  if (!user.branchId) {
    return null;
  }

  return { tenantId, user };
}

export function buildBranchScope(branchId: string | null | undefined) {
  return branchId ? eq(supportHandoffs.branchId, branchId) : undefined;
}
