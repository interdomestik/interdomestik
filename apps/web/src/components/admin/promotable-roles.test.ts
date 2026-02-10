import { describe, expect, it } from 'vitest';
import { isPromotableToAgentRole } from './promotable-roles';

describe('isPromotableToAgentRole', () => {
  it('allows staff and member/user roles', () => {
    expect(isPromotableToAgentRole('staff')).toBe(true);
    expect(isPromotableToAgentRole('member')).toBe(true);
    expect(isPromotableToAgentRole('user')).toBe(true);
  });

  it('rejects admin and agent roles', () => {
    expect(isPromotableToAgentRole('agent')).toBe(false);
    expect(isPromotableToAgentRole('admin')).toBe(false);
    expect(isPromotableToAgentRole('tenant_admin')).toBe(false);
    expect(isPromotableToAgentRole('super_admin')).toBe(false);
    expect(isPromotableToAgentRole(undefined)).toBe(false);
  });
});
