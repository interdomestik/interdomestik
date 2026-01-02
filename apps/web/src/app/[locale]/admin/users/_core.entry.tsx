import { getAgents, getUsers } from '@/actions/admin-users';
import { UsersFilters } from '@/components/admin/users-filters';
import { UsersSections } from '@/components/admin/users-sections';
import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
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

  const normalizeRole = (role?: string) => {
    if (!role || role === 'all' || role === 'user') return 'user';
    if (role === 'agent') return 'agent';
    if (role.includes('staff') || role.includes('admin')) return 'admin,staff';
    return 'user';
  };

  const selectedRole = normalizeRole(params.role);

  const users = await getUsers({
    search: params.search,
    role: selectedRole,
    assignment: selectedRole === 'user' ? params.assignment : undefined,
  });
  const agents = await getAgents();
  const t = await getTranslations('admin.users_page');
  const tSidebar = await getTranslations('admin.sidebar');
  const tFilters = await getTranslations('admin.users_filters');

  const roleOptions = [
    { value: 'user', label: tFilters('roles.user') },
    { value: 'agent', label: tFilters('roles.agent') },
    {
      value: 'admin,staff',
      label: `${tFilters('roles.staff')} / ${tFilters('roles.admin')}`,
    },
  ];

  const buildRoleHref = (role: string) => {
    const nextParams = new URLSearchParams();
    if (params.search) nextParams.set('search', params.search);
    if (role === 'user') {
      if (params.assignment) nextParams.set('assignment', params.assignment);
    }
    if (role !== 'user') {
      nextParams.set('role', role);
    }
    const query = nextParams.toString();
    return query ? `/admin/users?${query}` : '/admin/users';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{tSidebar('users')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-lg bg-muted/60 p-1">
          {roleOptions.map(option => {
            const isActive = selectedRole === option.value;
            return (
              <Button
                key={option.value}
                asChild
                size="sm"
                variant={isActive ? 'default' : 'ghost'}
                className="rounded-md"
              >
                <Link href={buildRoleHref(option.value)}>{option.label}</Link>
              </Button>
            );
          })}
        </div>
      </div>
      <UsersFilters hideRole hideAssignment={selectedRole !== 'user'} />
      <UsersSections users={users} agents={agents} />
    </div>
  );
}
