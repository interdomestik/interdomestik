import { MemberNotesCard } from '@/components/agent/member-notes-card';
import { ActivityFeed } from '@/components/crm/activity-feed';
import { LogActivityDialog } from '@/components/crm/log-activity-dialog';
import { auth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { getAgentClientProfileCore } from '@/app/[locale]/(agent)/agent/clients/[id]/_core';
import { AgentCard } from '@/app/[locale]/(agent)/agent/clients/[id]/components/agent-card';
import { ClaimsOverviewCard } from '@/app/[locale]/(agent)/agent/clients/[id]/components/claims-overview-card';
import { MemberHeader } from '@/app/[locale]/(agent)/agent/clients/[id]/components/member-header';
import { MembershipCard } from '@/app/[locale]/(agent)/agent/clients/[id]/components/membership-card';
import { PreferencesCard } from '@/app/[locale]/(agent)/agent/clients/[id]/components/preferences-card';
import { RecentClaimsCard } from '@/app/[locale]/(agent)/agent/clients/[id]/components/recent-claims-card';

export async function AgentClientDetailV2Page({ id, locale }: { id: string; locale: string }) {
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return notFound();
  }

  const role = (session.user as { role?: string | null }).role;
  if (role !== 'agent') {
    return notFound();
  }

  const t = await getTranslations('agent-members.members.profile');
  const tCommon = await getTranslations('common');
  const tClaims = await getTranslations('claims');

  const result = await getAgentClientProfileCore({
    memberId: id,
    viewer: { id: session.user.id, role, tenantId: session.user.tenantId },
  });

  if (result.kind !== 'ok') {
    return notFound();
  }

  const { member, membership, preferences, claimCounts: counts, recentClaims, activities } = result;
  const { subscription } = membership;

  const translationProps = { t, tCommon, tClaims };

  return (
    <section data-testid="agent-member-detail-ready" className="space-y-8">
      <MemberHeader member={member} membership={membership} {...translationProps} />

      <div className="grid gap-6 lg:grid-cols-3">
        <MembershipCard subscription={subscription} membership={membership} {...translationProps} />
        <AgentCard member={member} {...translationProps} />
        <PreferencesCard preferences={preferences} {...translationProps} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ClaimsOverviewCard counts={counts} {...translationProps} />
        <RecentClaimsCard recentClaims={recentClaims} {...translationProps} />
      </div>

      {/* Member Activities Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Member Activity</CardTitle>
            <LogActivityDialog entityId={member.id} entityType="member" />
          </CardHeader>
          <CardContent>
            <ActivityFeed activities={activities} />
          </CardContent>
        </Card>
      </div>

      {/* Member Notes Section */}
      <MemberNotesCard memberId={member.id} memberName={member.name || t('labels.unknown')} />
    </section>
  );
}
