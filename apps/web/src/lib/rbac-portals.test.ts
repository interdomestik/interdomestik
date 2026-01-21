import { describe, expect, it } from 'vitest';
import { getPortalHome, isAllowedInAdmin } from './rbac-portals';

describe('RBAC Portals Logic', () => {
  describe('isAllowedInAdmin', () => {
    it('allows admin roles', () => {
      expect(isAllowedInAdmin('admin')).toBe(true);
      expect(isAllowedInAdmin('super_admin')).toBe(true);
      expect(isAllowedInAdmin('tenant_admin')).toBe(true);
      expect(isAllowedInAdmin('branch_manager')).toBe(true);
    });

    it('denies user roles', () => {
      expect(isAllowedInAdmin('staff')).toBe(false);
      expect(isAllowedInAdmin('agent')).toBe(false);
      expect(isAllowedInAdmin('member')).toBe(false);
      expect(isAllowedInAdmin(null)).toBe(false);
    });
  });

  describe('getPortalHome', () => {
    it('returns correct home for user roles', () => {
      expect(getPortalHome('agent')).toBe('/agent');
      expect(getPortalHome('member')).toBe('/member');
      expect(getPortalHome('staff')).toBe('/staff');
    });

    it('returns explicit path for branch_manager even if allowed in admin', () => {
      // Just verifying the dictionary contains it if defined,
      // though logic might not redirect them if they ARE allowed in admin.
      expect(getPortalHome('branch_manager')).toBe('/admin/dashboard');
    });

    it('returns null for unknown roles', () => {
      expect(getPortalHome('unknown')).toBe(null);
    });
  });
});
