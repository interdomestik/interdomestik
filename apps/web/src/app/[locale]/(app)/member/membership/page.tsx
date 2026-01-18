import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getMemberSubscriptionsCore } from './_core';
import { MembershipOpsPage } from '@/features/member/membership/components/MembershipOpsPage';

export default async function MembershipPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const subscriptions = await getMemberSubscriptionsCore(session.user.id);

  return <MembershipOpsPage subscriptions={subscriptions} />;
}
