'use client';

import { PricingTable } from '@/components/pricing/pricing-table';
import { authClient } from '@/lib/auth-client';

type PricingPageRuntimeProps = Readonly<{
  billingTestMode: boolean;
}>;

export function PricingPageRuntime({ billingTestMode }: PricingPageRuntimeProps) {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  return (
    <PricingTable
      billingTestMode={billingTestMode}
      email={user?.email}
      isSessionPending={isPending}
      userId={user?.id}
    />
  );
}
