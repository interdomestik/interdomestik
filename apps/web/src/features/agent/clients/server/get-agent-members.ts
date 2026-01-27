import type { UserSession } from '@interdomestik/domain-users/types';
import { getUsersCore, type GetUsersFilters } from '@interdomestik/domain-users/admin/get-users';

type Params = {
  session: UserSession | null;
  search?: string;
};

export async function getAgentMembers(params: Params) {
  const filters: GetUsersFilters = {
    role: 'member',
    search: params.search,
  };

  const members = await getUsersCore({ session: params.session, filters });

  return members.map(member => ({
    ...member,
    createdAt:
      member.createdAt instanceof Date ? member.createdAt.toISOString() : (member.createdAt as any),
  }));
}
