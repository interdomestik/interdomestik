import type { MemberDashboardData } from '@interdomestik/domain-member';
import type { ReactElement } from 'react';

import {
  ActiveClaimFocus,
  ClaimsOverviewList,
  MemberEmptyState,
  MemberHeader,
  PrimaryActions,
  SupportLink,
} from '@/components/member-dashboard';

export type MemberDashboardViewProps = {
  data: MemberDashboardData;
  locale: string;
};

export function MemberDashboardView({ data, locale }: MemberDashboardViewProps): ReactElement {
  const { member, claims, activeClaimId, supportHref } = data;
  const activeClaim = claims.find(claim => claim.id === activeClaimId) ?? null;

  return (
    <div className="space-y-6">
      <MemberHeader name={member.name} membershipNumber={member.membershipNumber} />
      <PrimaryActions locale={locale} />

      {activeClaim ? (
        <ActiveClaimFocus
          claimNumber={activeClaim.claimNumber}
          status={activeClaim.status}
          stageLabel={activeClaim.stageLabel}
          updatedAt={activeClaim.updatedAt}
          nextMemberAction={
            activeClaim.requiresMemberAction ? activeClaim.nextMemberAction : undefined
          }
        />
      ) : null}

      {claims.length > 0 ? (
        <ClaimsOverviewList claims={claims} />
      ) : (
        <MemberEmptyState locale={locale} />
      )}

      <SupportLink href={supportHref} />
    </div>
  );
}
