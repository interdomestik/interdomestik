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

/** A reader call that first grants the staff claim reader its arguments state. */
export function grantedStaffReader<P extends { authority: TenantAuthority }, R>(
  resolveReader: Mock,
  read: (params: P) => Promise<R>
): (args: P & StaffReaderArgs) => Promise<R> {
  return args => read(grantStaffReader(resolveReader, args) as unknown as P);
}

/** As grantedStaffReader, for tests that need the granted reader's result. */
export function requiredStaffReader<P extends { authority: TenantAuthority }, R>(
  resolveReader: Mock,
  read: (params: P) => Promise<R | null>
): (args: P & StaffReaderArgs) => Promise<R> {
  const granted = grantedStaffReader(resolveReader, read);
  return async args => {
    const result = await granted(args);
    if (result === null) throw new Error('Expected a granted staff claim reader');
    return result;
  };
}
