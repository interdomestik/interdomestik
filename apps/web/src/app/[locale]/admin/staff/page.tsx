import { getAgents, getUsers } from '@/actions/admin-users';
import { UsersFilters } from '@/components/admin/users-filters';
import { UsersSections } from '@/components/admin/users-sections';

type Props = {
  searchParams: Promise<{
    search?: string;
  }>;
};

export default async function AdminStaffPage({ searchParams }: Props) {
  const params = await searchParams;
  const users = await getUsers({
    search: params.search,
    role: 'admin,staff',
  });
  const agents = await getAgents();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Staff</h1>
        <p className="text-muted-foreground">Manage administrators and support staff</p>
      </div>
      <UsersFilters hideRole />
      <UsersSections users={users} agents={agents} />
    </div>
  );
}
