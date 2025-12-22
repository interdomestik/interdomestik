import { getAgents, getUsers } from '@/actions/admin-users';
import { UsersFilters } from '@/components/admin/users-filters';
import { UsersSections } from '@/components/admin/users-sections';
import { getTranslations } from 'next-intl/server';

type Props = {
  searchParams: Promise<{
    search?: string;
    role?: string;
    assignment?: string;
  }>;
};

export default async function AdminUsersPage({ searchParams }: Props) {
  const params = await searchParams;
  const users = await getUsers({
    search: params.search,
    role: 'user',
    assignment: params.assignment,
  });
  const agents = await getAgents();
  const t = await getTranslations('admin.users_page');
  const tSidebar = await getTranslations('admin.sidebar');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{tSidebar('members')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      <UsersFilters hideRole />
      <UsersSections users={users} agents={agents} />
    </div>
  );
}
