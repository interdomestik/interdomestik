import { MembershipOpsPage } from '@/features/member/membership/components/MembershipOpsPage';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getMemberDocumentsCore, getMemberSubscriptionsCore } from './_core';

export default async function MembershipPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const subscriptions = await getMemberSubscriptionsCore({
    userId: session.user.id,
    tenantId: session.user.tenantId ?? null,
  });
  const documents = await getMemberDocumentsCore({
    userId: session.user.id,
    tenantId: session.user.tenantId ?? null,
  });

  return (
    <div data-testid="membership-page-ready">
      <MembershipOpsPage subscriptions={subscriptions} documents={documents} />
    </div>
  );
}
