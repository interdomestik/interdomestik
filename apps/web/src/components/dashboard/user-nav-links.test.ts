import { describe, expect, it } from 'vitest';
import { resolveUserNavLinks } from './user-nav-links';

describe('resolveUserNavLinks', () => {
  it.each([
    ['member', '/member/settings'],
    ['agent', '/agent/settings'],
    ['staff', '/staff/settings'],
    ['branch_manager', '/staff/settings'],
  ])('sends %s to its own settings page for both profile and settings', (role, href) => {
    expect(resolveUserNavLinks(role, false)).toEqual({ profileHref: href, settingsHref: href });
  });

  it('keeps the profile on the own settings page when tenant administration is granted', () => {
    expect(resolveUserNavLinks('staff', true)).toEqual({
      profileHref: '/staff/settings',
      settingsHref: '/admin/settings',
    });
  });

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'gives %s the admin account page for its profile and admin settings',
    role => {
      expect(resolveUserNavLinks(role, false)).toEqual({
        profileHref: '/admin/account',
        settingsHref: '/admin/settings',
      });
    }
  );

  it.each([
    ['auditor', false, '/member/settings'],
    ['auditor', true, '/admin/settings'],
    ['global_support', false, '/member/settings'],
    ['global_support', true, '/admin/settings'],
  ])(
    'keeps the profile of %s on member settings with admin access %s',
    (role, adminAccess, settingsHref) => {
      expect(resolveUserNavLinks(role as string, adminAccess as boolean)).toEqual({
        profileHref: '/member/settings',
        settingsHref,
      });
    }
  );

  it('never links the retired /profile route', () => {
    for (const role of [
      'member',
      'agent',
      'staff',
      'admin',
      'auditor',
      'global_support',
      undefined,
    ]) {
      expect(resolveUserNavLinks(role, false).profileHref).not.toBe('/profile');
    }
  });
});
