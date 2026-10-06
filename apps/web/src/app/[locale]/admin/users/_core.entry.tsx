import { getAgents, getUsers } from '@/actions/admin-users';
import { AdminUsersReadRecovery } from '@/components/admin/admin-users-read-recovery';
import { AdminUsersSearchProvider } from '@/components/admin/admin-users-search-provider';
import { AddAgentDialog } from '@/components/admin/add-agent-dialog';
import { AdminUsersRoleTabs } from '@/components/admin/admin-users-role-tabs';
import { UsersFilters } from '@/components/admin/users-filters';
import { UsersSections } from '@/components/admin/users-sections';
import { getTranslations } from 'next-intl/server';

import { notFound } from 'next/navigation';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getAgentChoicesForRole(role: string) {
  return role === 'user' ? getAgents() : Promise.resolve({ success: true as const, data: [] });
}

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
      // Include 'member' role in the User tab so they are visible
      role: selectedRole === 'user' ? 'user,member' : selectedRole,
      assignment: selectedRole === 'user' ? assignment : undefined,
    }),
    getAgentChoicesForRole(selectedRole),
  ]);

  const users = usersResult.success ? (usersResult.data ?? []) : [];
  const agents = agentsResult.success ? (agentsResult.data ?? []) : [];

  if (!usersResult.success) {
    if (
      usersResult.code === 'UNAUTHORIZED' ||
      usersResult.code === 'FORBIDDEN' ||
      usersResult.code?.startsWith('FORBIDDEN')
    ) {
      notFound();
    }
    console.error('Failed to load users:', usersResult.error);
  }

  if (!agentsResult.success) {
    if (
      agentsResult.code === 'UNAUTHORIZED' ||
      agentsResult.code === 'FORBIDDEN' ||
      agentsResult.code?.startsWith('FORBIDDEN')
    ) {
      notFound();
    }
    console.error('Failed to load agents:', agentsResult.error);
  }

  const t = await getTranslations('admin.users_page');
  const tFilters = await getTranslations('admin.users_filters');
  let recoveryMessage: string | null = null;
  if (!usersResult.success) recoveryMessage = t('load_users_error');
  else if (!agentsResult.success) recoveryMessage = t('load_agent_choices_error');

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

  const roleOptions = [
    { value: 'user', label: tFilters('roles.user'), href: buildRoleHref('user') },
    { value: 'agent', label: tFilters('roles.agent'), href: buildRoleHref('agent') },
    {
      value: 'admin,staff',
      label: `${tFilters('roles.staff')} / ${tFilters('roles.admin')}`,
      href: buildRoleHref('admin,staff'),
    },
  ];

  return (
    <div
      className="w-full max-w-[calc(100vw-3rem)] min-w-0 space-y-6 sm:max-w-full"
      data-testid="admin-users-page"
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 id="admin-users-heading" className="text-3xl font-bold tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <AddAgentDialog search={search} />
      </div>
      <AdminUsersSearchProvider>
        <AdminUsersRoleTabs selectedRole={selectedRole} options={roleOptions} />
        <UsersFilters hideRole hideAssignment={selectedRole !== 'user'} />
      </AdminUsersSearchProvider>
      <AdminUsersReadRecovery message={recoveryMessage}>
        {usersResult.success && (
          <UsersSections
            users={users}
            agents={agents}
            assignmentChoicesAvailable={agentsResult.success}
          />
        )}
      </AdminUsersReadRecovery>
    </div>
  );
}
