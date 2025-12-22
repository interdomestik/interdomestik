import { Link } from '@/i18n/routing';
import { db } from '@interdomestik/database/db';
import {
  claims,
  subscriptions,
  userNotificationPreferences,
  user as userTable,
} from '@interdomestik/database/schema';
import { Button } from '@interdomestik/ui/components/button';
import { count, desc, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { AgentInfoCard } from './_components/agent-info-card';
import { ClaimsStatsCard } from './_components/claims-stats-card';
import { MembershipInfoCard } from './_components/membership-info-card';
import { PreferencesCard } from './_components/preferences-card';
import { RecentClaimsCard } from './_components/recent-claims-card';
import { UserProfileHeader } from './_components/user-profile-header';
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
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('admin.member_profile');

  const member = await db.query.user.findFirst({
    where: eq(userTable.id, id),
    with: {
      agent: true,
    },
  });

  if (!member) {
    return notFound();
  }

  const [subscription, preferences, claimCounts, recentClaims] = await Promise.all([
    db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, member.id),
      orderBy: (table, { desc: descFn }) => [descFn(table.createdAt)],
    }),
    db.query.userNotificationPreferences.findFirst({
      where: eq(userNotificationPreferences.userId, member.id),
    }),
    db
      .select({ status: claims.status, total: count() })
      .from(claims)
      .where(eq(claims.userId, member.id))
      .groupBy(claims.status),
    db
      .select({
        id: claims.id,
        title: claims.title,
        status: claims.status,
        claimAmount: claims.claimAmount,
        currency: claims.currency,
        createdAt: claims.createdAt,
      })
      .from(claims)
      .where(eq(claims.userId, member.id))
      .orderBy(desc(claims.createdAt))
      .limit(RECENT_CLAIMS_LIMIT),
  ]);

  const counts = { total: 0, open: 0, resolved: 0, rejected: 0 };
  for (const row of claimCounts) {
    const status = row.status || 'draft';
    const total = Number(row.total || 0);
    counts.total += total;
    if (status === 'resolved') {
      counts.resolved += total;
    } else if (status === 'rejected') {
      counts.rejected += total;
    } else {
      counts.open += total;
    }
  }

  const rawStatus = subscription?.status;
  const membershipStatus = rawStatus && membershipStatusStyles[rawStatus] ? rawStatus : 'none';
  const membershipBadgeClass = membershipStatusStyles[membershipStatus];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/users">
            <ArrowLeft className="h-4 w-4" />
            {t('actions.back')}
          </Link>
        </Button>
        <ResendWelcomeEmailButton userId={member.id} />
      </div>

      <UserProfileHeader
        member={member}
        membershipStatus={membershipStatus}
        membershipBadgeClass={membershipBadgeClass}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <MembershipInfoCard
          subscription={subscription}
          membershipStatus={membershipStatus}
          membershipBadgeClass={membershipBadgeClass}
        />
        <AgentInfoCard agent={member.agent} />
        <PreferencesCard preferences={preferences} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ClaimsStatsCard counts={counts} />
        <RecentClaimsCard recentClaims={recentClaims} />
      </div>
    </div>
  );
}
