import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { AdminUserRolesPanel } from './_components/admin-user-roles-panel';
import { AgentInfoCard } from './_components/agent-info-card';
import { ClaimsStatsCard } from './_components/claims-stats-card';
import { MembershipInfoCard } from './_components/membership-info-card';
import { PreferencesCard } from './_components/preferences-card';
import { RecentClaimsCard } from './_components/recent-claims-card';
import { UserProfileHeader } from './_components/user-profile-header';
import { getAdminUserProfileCore } from './_core';
import { ResendWelcomeEmailButton } from './resend-welcome-button';

const RECENT_CLAIMS_LIMIT = 6;

const membershipStatusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  past_due: 'bg-amber-100 text-amber-700 border-amber-200',
  paused: 'bg-slate-100 text-slate-700 border-slate-200',
  canceled: 'bg-rose-100 text-rose-700 border-rose-200',
  none: 'bg-muted text-muted-foreground border-transparent',
};

export default async function MemberProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('admin.member_profile');

  const result = await getAdminUserProfileCore({
    userId: id,
    recentClaimsLimit: RECENT_CLAIMS_LIMIT,
  });
  if (result.kind === 'not_found') {
    return notFound();
  }

  const { member, subscription, preferences, counts, recentClaims, membershipStatus } = result;
  const membershipBadgeClass = membershipStatusStyles[membershipStatus];

  const backParams = new URLSearchParams();
  for (const [key, value] of Object.entries(sp ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        backParams.append(key, item);
      }
    } else {
      backParams.set(key, value);
    }
  }
  const backQuery = backParams.toString();
  const backHref = backQuery ? `/admin/users?${backQuery}` : '/admin/users';

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            {t('actions.back')}
          </Link>
        </Button>
        <ResendWelcomeEmailButton userId={member.id} />
      </div>

      <UserProfileHeader
        member={{
          ...member,
          emailVerified: member.emailVerified ? new Date() : null,
        }}
        membershipStatus={membershipStatus}
        membershipBadgeClass={membershipBadgeClass}
      />

      <AdminUserRolesPanel userId={member.id} />

      <div className="grid gap-6 lg:grid-cols-3">
        <MembershipInfoCard
          subscription={
            subscription
              ? {
                  planId: subscription.planId ?? 'none',
                  currentPeriodEnd: subscription.currentPeriodEnd,
                  cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
                }
              : null
          }
          membershipStatus={membershipStatus}
          membershipBadgeClass={membershipBadgeClass}
        />
        <AgentInfoCard agent={member.agent} />
        <PreferencesCard preferences={preferences ?? null} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ClaimsStatsCard counts={counts} />
        <RecentClaimsCard recentClaims={recentClaims} queryString={backQuery} />
      </div>
    </div>
  );
}
