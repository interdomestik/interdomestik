import { describe, expect, it } from 'vitest';

import {
  canAccessLead,
  isLeadActivityRole,
  memberActivityReadScope,
  memberActivityWriteScope,
} from './access';

// Every role the platform knows, the legacy member role `user`, and values that are no role.
const ROLE_MATRIX: ReadonlyArray<[unknown, string, string, boolean]> = [
  // role, read scope, write scope, lead activity role
  ['member', 'own', 'denied', false],
  ['user', 'own', 'denied', false],
  ['agent', 'assigned', 'assigned', true],
  ['staff', 'tenant', 'tenant', true],
  ['branch_manager', 'denied', 'denied', false],
  ['admin', 'tenant', 'tenant', true],
  ['tenant_admin', 'tenant', 'tenant', false],
  ['super_admin', 'tenant', 'tenant', false],
  ['promoter', 'denied', 'denied', false],
  ['auditor', 'denied', 'denied', false],
  ['global_support', 'denied', 'denied', false],
  ['Admin', 'denied', 'denied', false],
  ['', 'denied', 'denied', false],
  [null, 'denied', 'denied', false],
  [undefined, 'denied', 'denied', false],
];

describe('activity access rules deny by default', () => {
  it.each(ROLE_MATRIX)('role %j: read %s, write %s, lead %s', (role, read, write, lead) => {
    const value = role as string | null | undefined;
    expect(memberActivityReadScope(value)).toBe(read);
    expect(memberActivityWriteScope(value)).toBe(write);
    expect(isLeadActivityRole(value)).toBe(lead);
  });

  it('lets an agent reach only the leads assigned to it', () => {
    const agent = { id: 'agent-1', role: 'agent' };
    expect(canAccessLead(agent, 'agent-1')).toBe(true);
    expect(canAccessLead(agent, 'agent-2')).toBe(false);
  });

  it('lets staff and admin reach any lead of their tenant, and nobody else', () => {
    expect(canAccessLead({ id: 'staff-1', role: 'staff' }, 'agent-2')).toBe(true);
    expect(canAccessLead({ id: 'admin-1', role: 'admin' }, 'agent-2')).toBe(true);
    for (const role of ['member', 'user', 'branch_manager', 'tenant_admin', 'auditor']) {
      expect(canAccessLead({ id: 'agent-2', role }, 'agent-2')).toBe(false);
    }
  });
});
