import { getAgents, getUsers } from '@/actions/admin-users';
import { UsersFilters } from '@/components/admin/users-filters';
import { UsersSections } from '@/components/admin/users-sections';
import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import { getTranslations } from 'next-intl/server';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminUsersPage({ searchParams }: Props) {
  const params = await searchParams;

  const getFirst = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const search = getFirst(params.search);
  const roleParam = getFirst(params.role);
  const assignment = getFirst(params.assignment);

  const normalizeRole = (role?: string) => {
    if (!role || role === 'all' || role === 'user') return 'user';
    if (role === 'agent') return 'agent';
    if (role.includes('staff') || role.includes('admin')) return 'admin,staff';
    return 'user';
  };

  const selectedRole = normalizeRole(roleParam);

  const [usersResult, agentsResult] = await Promise.all([
    getUsers({
      search,
      role: selectedRole,
      assignment: selectedRole === 'user' ? assignment : undefined,
    }),
    getAgents(),
  ]);

  const users = usersResult.success ? usersResult.data : [];
  const agents = agentsResult.success ? agentsResult.data : [];

  if (!usersResult.success) {
    console.error('Failed to load users:', usersResult.error);
  }

  if (!agentsResult.success) {
    console.error('Failed to load agents:', agentsResult.error);
  }

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
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) nextParams.append(key, item);
        continue;
      }
      nextParams.set(key, value);
    }

    // Reset pagination on role change to avoid empty results.
    nextParams.delete('page');

    // Update only the role param; preserve everything else.
    if (role === 'user') {
      nextParams.delete('role');
    } else {
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
                asChild={!isActive}
                disabled={isActive}
                size="sm"
                variant={isActive ? 'default' : 'ghost'}
                className="rounded-md"
              >
                {isActive ? (
                  option.label
                ) : (
                  <Link href={buildRoleHref(option.value)}>{option.label}</Link>
                )}
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
