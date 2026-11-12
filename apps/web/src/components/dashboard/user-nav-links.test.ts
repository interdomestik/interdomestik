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

  it('keeps tenant administration grants out of platform settings', () => {
    expect(resolveUserNavLinks('staff', true)).toEqual({
      profileHref: '/staff/settings',
      settingsHref: '/staff/settings',
    });
  });

  it.each([
    ['admin', '/admin/account'],
    ['tenant_admin', '/admin/account'],
    ['super_admin', '/admin/settings'],
  ])('gives %s the admin account profile and only admitted settings', (role, settingsHref) => {
    expect(resolveUserNavLinks(role, false)).toEqual({
      profileHref: '/admin/account',
      settingsHref,
    });
  });

  it.each([
    ['auditor', false, '/member/settings'],
    ['auditor', true, '/member/settings'],
    ['global_support', false, '/member/settings'],
    ['global_support', true, '/member/settings'],
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
