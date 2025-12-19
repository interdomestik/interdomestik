import { getAgents, getUsers } from '@/actions/admin-users';
import { UsersTable } from '@/components/admin/users-table';
import { getTranslations } from 'next-intl/server';

export default async function AdminUsersPage() {
  const users = await getUsers();
  const agents = await getAgents();
  const t = await getTranslations('admin.users_page');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      <UsersTable users={users} agents={agents} />
    </div>
  );
}
