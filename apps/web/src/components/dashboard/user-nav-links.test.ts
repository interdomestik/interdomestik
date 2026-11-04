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
    'gives %s admin settings and no portal profile page',
    role => {
      expect(resolveUserNavLinks(role, false)).toEqual({
        profileHref: null,
        settingsHref: '/admin/settings',
      });
    }
  );

  it('never links the retired /profile route', () => {
    for (const role of ['member', 'agent', 'staff', 'auditor', undefined]) {
      expect(resolveUserNavLinks(role, false).profileHref).not.toBe('/profile');
    }
  });
});
