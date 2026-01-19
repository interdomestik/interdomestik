import { describe, expect, it } from 'vitest';
import { getMemberDashboardCore } from './_core';

describe('getMemberDashboardCore', () => {
  it('allows members to see their dashboard', () => {
    const result = getMemberDashboardCore({ role: 'member', userId: 'u1', locale: 'en' });
    expect(result).toEqual({ kind: 'ok', userId: 'u1' });
  });

  it('redirects agents to agent portal', () => {
    const result = getMemberDashboardCore({ role: 'agent', userId: 'a1', locale: 'sq' });
    expect(result).toEqual({ kind: 'redirect', to: '/sq/agent' });
  });

  it('redirects staff and branch managers to staff portal', () => {
    expect(getMemberDashboardCore({ role: 'staff', userId: 's1', locale: 'mk' })).toEqual({
      kind: 'redirect',
      to: '/mk/staff',
    });
    expect(getMemberDashboardCore({ role: 'branch_manager', userId: 'bm1', locale: 'en' })).toEqual(
      { kind: 'redirect', to: '/en/staff' }
    );
  });

  it('redirects admin, super_admin, and tenant_admin to admin portal', () => {
    expect(getMemberDashboardCore({ role: 'admin', userId: 'adm1', locale: 'en' })).toEqual({
      kind: 'redirect',
      to: '/en/admin',
    });
    expect(getMemberDashboardCore({ role: 'super_admin', userId: 'sa1', locale: 'sq' })).toEqual({
      kind: 'redirect',
      to: '/sq/admin',
    });
    expect(getMemberDashboardCore({ role: 'tenant_admin', userId: 'ta1', locale: 'mk' })).toEqual({
      kind: 'redirect',
      to: '/mk/admin',
    });
  });
});
