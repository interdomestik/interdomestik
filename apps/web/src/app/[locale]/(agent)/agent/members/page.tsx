import { getUsers } from '@/actions/admin-users';
import { AgentMembersProPage } from '@/features/agent/clients/components/AgentMembersProPage';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ search?: string }>;
};

export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  const { search } = await searchParams;
  setRequestLocale(locale);

  // Fetch users with search filter, scoped to agent by the updated domain logic
  const result = await getUsers({
    search,
  });

  if (!result.success) {
    if (result.code === 'UNAUTHORIZED' || result.code === 'FORBIDDEN') {
      redirect('/auth/login');
    }
    throw new Error(result.error);
  }

  const members = result.data ?? [];

  return <AgentMembersProPage members={members} />;
}
