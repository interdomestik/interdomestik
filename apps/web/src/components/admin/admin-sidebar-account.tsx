'use client';

import { SidebarUserMenu } from '@/components/dashboard/sidebar-user-menu';
import { resolveUserNavLinks } from '@/components/dashboard/user-nav-links';
import type { AdminSidebarUser } from './admin-sidebar-navigation';

/** Reuse account presentation while preserving the admin sidebar's role-specific profile. */
export function AdminSidebarAccount({ user }: Readonly<{ user: AdminSidebarUser }>) {
  return (
    <SidebarUserMenu user={user} profileHref={resolveUserNavLinks(user.role, true).profileHref} />
  );
}
