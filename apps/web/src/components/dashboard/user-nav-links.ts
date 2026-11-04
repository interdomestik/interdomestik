import { isAdmin } from '@/lib/roles.core';

export type UserNavLinks = Readonly<{
  /** The signed-in user's own settings page, which holds the profile form; null when none. */
  profileHref: string | null;
  /** The settings entry; tenant administration wins when the user can administer the tenant. */
  settingsHref: string;
}>;

function ownSettingsHref(role: string | null | undefined): string | null {
  switch (role) {
    case 'member':
      return '/member/settings';
    case 'agent':
      return '/agent/settings';
    case 'staff':
    case 'branch_manager':
      return '/staff/settings';
    default:
      return null;
  }
}

/** Resolves the user menu's profile and settings destinations for the signed-in role. */
export function resolveUserNavLinks(
  role: string | null | undefined,
  adminAccess: boolean
): UserNavLinks {
  const profileHref = ownSettingsHref(role);
  const settingsHref =
    isAdmin(role) || adminAccess ? '/admin/settings' : (profileHref ?? '/member/settings');
  return { profileHref, settingsHref };
}
