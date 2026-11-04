import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readTenantAuthority = vi.hoisted(() => vi.fn());
vi.mock('@interdomestik/database/tenant-authority', () => ({ readTenantAuthority }));

import { resolveStaffClaimReader } from './reader-policy';

const AUTHORITY = {} as TenantAuthority;

function descriptor(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant_ks',
    accessTenantId: 'tenant_ks',
    purpose: 'session',
    principal: { userId: 'staff-1', role: 'staff', branchId: 'ks_branch_a', agentId: null },
    expiresAtMs: Number.MAX_SAFE_INTEGER,
    ...overrides,
  };
}

describe('resolveStaffClaimReader', () => {
  beforeEach(() => readTenantAuthority.mockReset());

  it.each([
    ['staff', 'ks_branch_a'],
    ['staff', null],
    ['branch_manager', 'ks_branch_a'],
    ['branch_manager', null],
  ])('derives a %s reader with branch %s from the session principal', (role, branchId) => {
    readTenantAuthority.mockReturnValue(
      descriptor({ principal: { userId: 'actor-1', role, branchId, agentId: null } })
    );
    expect(resolveStaffClaimReader(AUTHORITY)).toEqual({
      tenantId: 'tenant_ks',
      staffId: 'actor-1',
      role,
      branchId,
    });
  });

  it.each(['member', 'agent', 'admin', 'tenant_admin', 'super_admin', 'auditor', null])(
    'grants no reader to role %s',
    role => {
      readTenantAuthority.mockReturnValue(
        descriptor({ principal: { userId: 'actor-1', role, branchId: null, agentId: null } })
      );
      expect(resolveStaffClaimReader(AUTHORITY)).toBeNull();
    }
  );

  it('grants no reader without a principal', () => {
    readTenantAuthority.mockReturnValue(descriptor({ principal: null }));
    expect(resolveStaffClaimReader(AUTHORITY)).toBeNull();
  });

  it('grants a reader to a test authority standing in for a session', () => {
    readTenantAuthority.mockReturnValue(descriptor({ purpose: 'test' }));
    expect(resolveStaffClaimReader(AUTHORITY)).toMatchObject({ staffId: 'staff-1', role: 'staff' });
  });

  it.each(['scheduled-work', 'platform-aggregate', 'claim-home-read', 'public-token'])(
    'grants no reader to a %s authority',
    purpose => {
      readTenantAuthority.mockReturnValue(descriptor({ purpose }));
      expect(resolveStaffClaimReader(AUTHORITY)).toBeNull();
    }
  );
});
