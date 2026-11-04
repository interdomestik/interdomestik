import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';

export type StaffClaimReaderRole = 'staff' | 'branch_manager';

/** Who reads the staff claim surfaces, as the authenticated tenant authority states it. */
export type StaffClaimReader = Readonly<{
  tenantId: string;
  staffId: string;
  role: StaffClaimReaderRole;
  branchId: string | null;
}>;

function isStaffClaimReaderRole(role: string | null): role is StaffClaimReaderRole {
  return role === 'staff' || role === 'branch_manager';
}

// Only an authenticated session reads staff claim surfaces. Test authorities stand in for a session
// and can be minted only under a test runner.
const READER_PURPOSES = new Set(['session', 'test']);

/**
 * The staff claim reader the authority grants, or null when it grants none: an authority minted
 * for another purpose, a missing principal, or a role without staff claim surfaces. Readers derive
 * actor, role and branch only from here, never from caller-supplied fields.
 */
export function resolveStaffClaimReader(authority: TenantAuthority): StaffClaimReader | null {
  const { tenantId, purpose, principal } = readTenantAuthority(authority);
  if (!READER_PURPOSES.has(purpose) || !principal) return null;
  if (!isStaffClaimReaderRole(principal.role)) return null;
  return Object.freeze({
    tenantId,
    staffId: principal.userId,
    role: principal.role,
    branchId: principal.branchId,
  });
}
