import { describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database', () => ({ agentClients: {}, claims: {} }));

import { isFullTenantClaimsRole, isScopedClaimsReadRole } from './access';

const roles = [
  { label: 'admin', role: 'admin', full: true, scoped: false },
  { label: 'tenant_admin', role: 'tenant_admin', full: true, scoped: false },
  { label: 'super_admin', role: 'super_admin', full: true, scoped: false },
  { label: 'staff', role: 'staff', full: false, scoped: true },
  { label: 'branch_manager', role: 'branch_manager', full: false, scoped: true },
  { label: 'member', role: 'member', full: false, scoped: false },
  { label: 'agent', role: 'agent', full: false, scoped: false },
  { label: 'user', role: 'user', full: false, scoped: false },
  { label: 'empty', role: '', full: false, scoped: false },
  { label: 'null', role: null, full: false, scoped: false },
  { label: 'undefined', role: undefined, full: false, scoped: false },
  { label: 'unknown', role: 'unknown', full: false, scoped: false },
] as const;

describe('message role admission', () => {
  it.each(roles)('preserves the pre-change admission for $label', ({ role, full, scoped }) => {
    expect(isFullTenantClaimsRole(role)).toBe(full);
    expect(isScopedClaimsReadRole(role)).toBe(scoped);
  });

  it('does not let an altered Set membership method admit a member', () => {
    const originalHas = Set.prototype.has;
    let actual: boolean[];
    try {
      Set.prototype.has = () => true;
      // Synchronous predicate calls only: restore before any Vitest assertion or await.
      actual = [isFullTenantClaimsRole('member'), isScopedClaimsReadRole('member')];
    } finally {
      Set.prototype.has = originalHas;
    }
    expect(actual).toEqual([false, false]);
  });
});
