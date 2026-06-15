import { describe, expect, it } from 'vitest';
import {
  resolveMemberActorRoleOnSession,
  withMemberActorRoleOnSession,
} from './actor-role-on-session';

describe('resolveMemberActorRoleOnSession', () => {
  it('exercises member role for member-compatible users on the member surface', () => {
    expect(resolveMemberActorRoleOnSession('agent')).toBe('member');
    expect(resolveMemberActorRoleOnSession('member')).toBe('member');
    expect(resolveMemberActorRoleOnSession('user')).toBe('member');
  });

  it('preserves non-member roles so portal redirects still apply', () => {
    expect(resolveMemberActorRoleOnSession('staff')).toBe('staff');
    expect(resolveMemberActorRoleOnSession('branch_manager')).toBe('branch_manager');
    expect(resolveMemberActorRoleOnSession('tenant_admin')).toBe('tenant_admin');
    expect(resolveMemberActorRoleOnSession(null)).toBeNull();
  });

  it('clones a session with the exercised member role without changing identity', () => {
    const session = { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } };

    expect(withMemberActorRoleOnSession(session)).toEqual({
      user: { id: 'agent-1', role: 'member', tenantId: 'tenant-1' },
    });
    expect(session.user.role).toBe('agent');
  });
});
