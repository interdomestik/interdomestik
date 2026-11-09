import { and, claims, eq, user as userTable } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ClaimsSession } from '../claims/types';
import { assignClaimSchema } from '../validators/claims';
import { buildScopedStaffClaimWhere } from './scope';
import type { ActionResult } from './types';
import { assignClaimInTransaction } from './assign-transaction';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type StaffUser = ClaimsSession['user'] & { branchId?: string | null };
type StaffClaimRecord = { id: string; staffId: string | null; branchId: string | null };

function resolveNextStaffId(params: { requestedStaffId?: string | null; userId: string }) {
  return params.requestedStaffId === undefined ? params.userId : params.requestedStaffId;
}

async function getScopedClaim(args: {
  authority: TenantAuthority;
  branchId: string | null;
  claimId: string;
  userId: string;
}): Promise<StaffClaimRecord | undefined> {
  const { authority, ...scope } = args;
  const { tenantId } = readTenantAuthority(authority);
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const [existingClaim] = await withTenantAuthority(authority, tx =>
    tx
      .select({ id: claims.id, staffId: claims.staffId, branchId: claims.branchId })
      .from(claims)
      .where(buildScopedStaffClaimWhere({ ...scope, tenantId }))
      .limit(1)
  );

  return existingClaim;
}

function buildAssigneeScope(args: { branchId: string | null; staffId: string; tenantId: string }) {
  const baseScope = and(eq(userTable.id, args.staffId), eq(userTable.role, 'staff'));

  if (args.branchId == null) {
    return withTenant(args.tenantId, userTable.tenantId, baseScope);
  }

  return withTenant(
    args.tenantId,
    userTable.tenantId,
    and(baseScope, eq(userTable.branchId, args.branchId))
  );
}

async function findScopedAssignee(args: {
  authority: TenantAuthority;
  branchId: string | null;
  staffId: string;
}) {
  const { authority, ...scope } = args;
  const { tenantId } = readTenantAuthority(authority);
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  return withTenantAuthority(authority, tx =>
    tx.query.user.findFirst({
      where: buildAssigneeScope({ ...scope, tenantId }),
      columns: {
        id: true,
      },
    })
  );
}

/** Assign a claim to an in-scope staff member, defaulting to self-assignment */
export async function assignClaimCore(params: {
  authority: TenantAuthority | null;
  claimId: string;
  staffId?: string | null;
  session: ClaimsSession | null;
  requestHeaders?: Headers;
}): Promise<ActionResult> {
  const { authority, claimId, session, requestHeaders } = params;

  if (!authority || session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  ensureTenantId(session);
  readTenantAuthority(authority);
  const user = session.user as StaffUser;
  const branchId = user.branchId ?? null;
  const nextStaffId = resolveNextStaffId({
    requestedStaffId: params.staffId,
    userId: user.id,
  });
  const parsedAssignment = assignClaimSchema.safeParse({ staffId: nextStaffId });
  if (!parsedAssignment.success) {
    return { success: false, error: 'Invalid staff assignment', data: undefined };
  }

  try {
    const existingClaim = await getScopedClaim({
      authority,
      branchId,
      claimId,
      userId: user.id,
    });

    if (existingClaim === undefined) {
      return { success: false, error: 'Claim not found or access denied' };
    }

    if (existingClaim.staffId === nextStaffId) {
      return { success: true };
    }

    if (nextStaffId !== null && nextStaffId !== user.id) {
      const assignee = await findScopedAssignee({
        authority,
        branchId,
        staffId: nextStaffId,
      });

      if (assignee == null) {
        return { success: false, error: 'Staff member not found or out of scope' };
      }
    }

    return await withTenantAuthority(authority, tx =>
      assignClaimInTransaction(tx, {
        authority,
        branchId,
        claimId,
        userId: user.id,
        actorRole: user.role,
        nextStaffId,
        previousStaffId: existingClaim.staffId,
        requestHeaders,
      })
    );
  } catch (error) {
    console.error('Failed to assign claim:', error);
    return { success: false, error: 'Failed to assign claim' };
  }
}
