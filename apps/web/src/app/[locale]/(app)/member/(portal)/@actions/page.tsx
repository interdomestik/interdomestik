import { Suspense } from 'react';

import { MemberPortalRegionBoundary } from '@/components/dashboard/member-portal-region-boundary';
import { PortalActionsRegion } from '@/components/dashboard/member-portal-runtime';

import { getMemberPortalContext } from '../portal-context';

export default async function MemberActionsSlot({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  const context = await getMemberPortalContext(locale);
  return (
    <Suspense
      fallback={<MemberPortalRegionBoundary copy={context.copy.regions.actions} state="loading" />}
    >
      <PortalActionsRegion
        copy={context.copy}
        promise={context.membershipTask}
        canDraft={context.canDraft}
        isAgent={context.isAgent}
        locale={context.locale}
      />
    </Suspense>
  );
}
