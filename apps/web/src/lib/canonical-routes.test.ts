import { describe, expect, it } from 'vitest';

import { getCanonicalRouteForRole } from './canonical-routes';

describe('getCanonicalRouteForRole', () => {
  it('maps member to member dashboard', () => {
    expect(getCanonicalRouteForRole('member', 'sq')).toBe('/sq/member');
  });

  it('maps agent to agent members', () => {
    expect(getCanonicalRouteForRole('agent', 'sq')).toBe('/sq/agent/members');
  });

  it('maps staff to staff claims', () => {
    expect(getCanonicalRouteForRole('staff', 'sq')).toBe('/sq/staff/claims');
  });

  it('maps admin roles to admin overview', () => {
    expect(getCanonicalRouteForRole('admin', 'sq')).toBe('/sq/admin/overview');
    expect(getCanonicalRouteForRole('tenant_admin', 'sq')).toBe('/sq/admin/overview');
    expect(getCanonicalRouteForRole('super_admin', 'sq')).toBe('/sq/admin/overview');
    expect(getCanonicalRouteForRole('branch_manager', 'sq')).toBe('/sq/admin/overview');
  });

  it('returns null for unknown role', () => {
    expect(getCanonicalRouteForRole('unknown', 'sq')).toBeNull();
  });
});
