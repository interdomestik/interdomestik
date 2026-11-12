import type { ComponentProps } from 'react';
import { ADMIN_USER_ROLES } from '@/features/admin/access/admin-capabilities';
import { getCachedSession } from '@/lib/auth.server';
import { requireEffectivePortalAccessOrNotFound } from '@/server/auth/effective-portal-access';
import AdminUsersPage from './_core.entry';

export default async function Page(
  props: ComponentProps<typeof AdminUsersPage>
): Promise<React.JSX.Element> {
  await requireEffectivePortalAccessOrNotFound(await getCachedSession(), ADMIN_USER_ROLES);
  return <AdminUsersPage {...props} />;
}
