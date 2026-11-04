import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import type { Mock } from 'vitest';
import type { StaffClaimReader, StaffClaimReaderRole } from './reader-policy';

export type StaffReaderArgs = {
  authority: TenantAuthority;
  staffId: string;
  branchId?: string | null;
  viewerRole?: StaffClaimReaderRole;
};

/**
 * Test authorities carry no session principal, so these tests state the reader the policy would
 * derive and pass only the reader inputs the production API still accepts.
 */
export function grantStaffReader<T extends StaffReaderArgs>(
  resolveReader: Mock,
  args: T
): Omit<T, 'staffId' | 'branchId' | 'viewerRole'> {
  const { staffId, branchId = null, viewerRole = 'staff', ...params } = args;
  const reader: StaffClaimReader = {
    tenantId: readTenantAuthority(args.authority).tenantId,
    staffId,
    role: viewerRole,
    branchId,
  };
  resolveReader.mockReturnValue(reader);
  return params;
}
