import { canManagePlatformSettings } from '@/features/admin/access/admin-capabilities';
import { getCachedSession } from '@/lib/auth.server';
import { notFound, redirect } from 'next/navigation';
import AdminSettingsPage from './_core.entry';

export default async function Page(): Promise<React.JSX.Element> {
  const session = await getCachedSession();
  if (!session?.user) redirect('/login');
  if (!canManagePlatformSettings(session.user.role)) notFound();
  return <AdminSettingsPage />;
}
