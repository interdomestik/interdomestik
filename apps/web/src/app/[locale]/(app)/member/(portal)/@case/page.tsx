import { Suspense } from 'react';

import { MemberPortalRegionBoundary } from '@/components/dashboard/member-portal-region-boundary';
import { PortalCasesRegion } from '@/components/dashboard/member-portal-runtime';

import { getMemberPortalContext } from '../portal-context';

export default async function MemberCaseSlot({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  const context = await getMemberPortalContext(locale);
  return (
    <Suspense
      fallback={<MemberPortalRegionBoundary copy={context.copy.regions.case} state="loading" />}
    >
      <PortalCasesRegion copy={context.copy} promise={context.caseTask} />
    </Suspense>
  );
}
