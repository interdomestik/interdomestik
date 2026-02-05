import { describe, expect, it } from 'vitest';

import {
  getCanonicalRouteForRole,
  getPortalLabel,
  stripLocalePrefixFromCanonicalRoute,
} from './canonical-routes';

describe('getCanonicalRouteForRole', () => {
  it('maps member to member dashboard', () => {
    expect(getCanonicalRouteForRole('member', 'sq')).toBe('/sq/member');
  });

  it('maps user to member dashboard', () => {
    expect(getCanonicalRouteForRole('user', 'sq')).toBe('/sq/member');
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

  it('returns null for empty locale', () => {
    expect(getCanonicalRouteForRole('member', '')).toBeNull();
  });
});

describe('getPortalLabel', () => {
  it('maps admin roles to Admin', () => {
    expect(getPortalLabel('admin')).toBe('Admin');
    expect(getPortalLabel('tenant_admin')).toBe('Admin');
    expect(getPortalLabel('super_admin')).toBe('Admin');
    expect(getPortalLabel('branch_manager')).toBe('Admin');
  });

  it('maps staff to Staff', () => {
    expect(getPortalLabel('staff')).toBe('Staff');
  });

  it('maps agent to Agent', () => {
    expect(getPortalLabel('agent')).toBe('Agent');
  });

  it('maps member and user to Member', () => {
    expect(getPortalLabel('member')).toBe('Member');
    expect(getPortalLabel('user')).toBe('Member');
  });

  it('returns null for unknown role', () => {
    expect(getPortalLabel('unknown')).toBeNull();
  });
});

describe('stripLocalePrefixFromCanonicalRoute', () => {
  it('removes locale prefix when present', () => {
    expect(stripLocalePrefixFromCanonicalRoute('/sq/agent/members', 'sq')).toBe('/agent/members');
  });

  it('returns null when canonical is null', () => {
    expect(stripLocalePrefixFromCanonicalRoute(null, 'sq')).toBeNull();
  });

  it('returns canonical when locale is invalid', () => {
    expect(stripLocalePrefixFromCanonicalRoute('/sq/agent/members', '')).toBe('/sq/agent/members');
  });
});
