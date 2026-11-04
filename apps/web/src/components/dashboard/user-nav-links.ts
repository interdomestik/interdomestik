import { isAdmin } from '@/lib/roles.core';

export type UserNavLinks = Readonly<{
  /** The signed-in user's own account page, which holds the profile form. */
  profileHref: string;
  /** The settings entry; tenant administration wins when the user can administer the tenant. */
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
  adminAccess: boolean
): UserNavLinks {
  const profileHref = ownSettingsHref(role);
  const settingsHref = isAdmin(role) || adminAccess ? '/admin/settings' : profileHref;
  return { profileHref, settingsHref };
}
