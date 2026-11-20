import { isAdmin } from '@/lib/roles.core';
import { canManagePlatformSettings } from '@/features/admin/access/admin-capabilities';

export type UserNavLinks = Readonly<{
  /** The signed-in user's own account page, which holds the profile form. */
  profileHref: string;
  /** Platform settings require a super admin; other users keep their own account settings. */
  settingsHref: string;
}>;

/** Each portal admits its own account page; the member settings page admits every other role. */
function ownSettingsHref(role: string | null | undefined): string {
  if (isAdmin(role)) return '/admin/account';
  switch (role) {
    case 'agent':
      return '/agent/settings';
    case 'staff':
    case 'branch_manager':
      return '/staff/settings';
    default:
      return '/member/settings';
  }
}

/** Resolves the user menu's profile and settings destinations for the signed-in role. */
export function resolveUserNavLinks(
  role: string | null | undefined,
  _adminAccess: boolean
): UserNavLinks {
  const profileHref = ownSettingsHref(role);
  const settingsHref = canManagePlatformSettings(role) ? '/admin/settings' : profileHref;
  return { profileHref, settingsHref };
}
