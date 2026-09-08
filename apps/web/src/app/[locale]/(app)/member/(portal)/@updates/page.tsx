import { Suspense } from 'react';

import { MemberPortalRegionBoundary } from '@/components/dashboard/member-portal-region-boundary';
import { PortalUpdatesRegion } from '@/components/dashboard/member-portal-runtime';

import { getMemberPortalContext } from '../portal-context';

export default async function MemberUpdatesSlot({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  const context = await getMemberPortalContext(locale);
  return (
    <Suspense
      fallback={<MemberPortalRegionBoundary copy={context.copy.regions.updates} state="loading" />}
    >
      <PortalUpdatesRegion copy={context.copy} promise={context.caseTask} locale={context.locale} />
    </Suspense>
  );
}
