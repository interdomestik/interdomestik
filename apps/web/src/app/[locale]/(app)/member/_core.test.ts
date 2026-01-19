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

  it('redirects staff to staff portal', () => {
    const result = getMemberDashboardCore({ role: 'staff', userId: 's1', locale: 'mk' });
    expect(result).toEqual({ kind: 'redirect', to: '/mk/staff' });
  });

  it('redirects admin to admin portal', () => {
    const result = getMemberDashboardCore({ role: 'admin', userId: 'adm1', locale: 'en' });
    expect(result).toEqual({ kind: 'redirect', to: '/en/admin' });
  });
});
