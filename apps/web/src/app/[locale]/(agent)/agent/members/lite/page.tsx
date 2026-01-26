import { getUsers } from '@/actions/admin-users';
import { AgentMembersLitePage } from '@/features/agent/clients/components/AgentMembersLitePage';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const result = await getUsers({});

  if (!result.success) {
    if (result.code === 'UNAUTHORIZED' || result.code === 'FORBIDDEN') {
      redirect('/auth/login');
    }
    throw new Error(result.error);
  }

  const members = result.data ?? [];

  return <AgentMembersLitePage members={members} />;
}
