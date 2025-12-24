import { getMemberActivities } from '@/actions/activities';
import { MemberNotesCard } from '@/components/agent/member-notes-card';
import { ActivityFeed } from '@/components/crm/activity-feed';
import { LogActivityDialog } from '@/components/crm/log-activity-dialog';
import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import {
  claims,
  subscriptions,
  userNotificationPreferences,
  user as userTable,
} from '@interdomestik/database/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui/components/table';
import { count, desc, eq } from 'drizzle-orm';
import { ArrowLeft, BadgeCheck, Mail, User } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

const RECENT_CLAIMS_LIMIT = 6;

const membershipStatusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  past_due: 'bg-amber-100 text-amber-700 border-amber-200',
  paused: 'bg-slate-100 text-slate-700 border-slate-200',
  canceled: 'bg-rose-100 text-rose-700 border-rose-200',
  none: 'bg-muted text-muted-foreground border-transparent',
};

function formatDate(value: Date | string | null, fallback: string) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString();
}

export default async function AgentMemberProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return notFound();
  }

  const t = await getTranslations('agent-members.members.profile');
  const tCommon = await getTranslations('common');
  const tClaims = await getTranslations('claims');

  const member = await db.query.user.findFirst({
    where: eq(userTable.id, id),
    with: {
      agent: true,
    },
  });

  if (!member) {
    return notFound();
  }

  if (session.user.role === 'agent' && member.agentId !== session.user.id) {
    return notFound();
  }

  const [subscription, preferences, claimCounts, recentClaims, activities] = await Promise.all([
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
        status: claims.status,
      })
      .from(claims)
      .where(eq(claims.userId, member.id))
      .orderBy(desc(claims.createdAt))
      .limit(RECENT_CLAIMS_LIMIT),
    getMemberActivities(member.id),
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
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Button asChild variant="ghost" size="sm">
          <Link href="/agent/clients">
            <ArrowLeft className="h-4 w-4" />
            {t('actions.back')}
          </Link>
        </Button>
      </div>

      <div className="rounded-2xl border bg-muted/20 p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-16 w-16">
              <AvatarImage src={member.image || ''} />
              <AvatarFallback className="text-lg">
                {member.name?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold">{member.name || t('labels.unknown')}</h1>
                <Badge variant="outline">{tCommon(`roles.${member.role}`)}</Badge>
                <Badge className={membershipBadgeClass} variant="outline">
                  {t(`status.${membershipStatus}`)}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {member.email}
                </span>
                <span className="inline-flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4" />
                  {member.emailVerified
                    ? t('labels.email_verified_yes')
                    : t('labels.email_verified_no')}
                </span>
              </div>
            </div>
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">{t('labels.member_id')}:</span>{' '}
              <span className="font-mono">
                {member.memberNumber || `ID-${member.id.slice(0, 8).toUpperCase()}`}
              </span>
            </div>
            <div>
              <span className="font-medium text-foreground">{t('labels.joined')}:</span>{' '}
              {formatDate(member.createdAt, tCommon('none'))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('sections.membership')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('labels.status')}</span>
              <Badge className={membershipBadgeClass} variant="outline">
                {t(`status.${membershipStatus}`)}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('labels.plan')}</span>
              <span className="font-medium text-foreground">
                {subscription?.planId || t('labels.not_set')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('labels.period_end')}</span>
              <span className="font-medium text-foreground">
                {formatDate(subscription?.currentPeriodEnd ?? null, tCommon('none'))}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('labels.cancel_at_period_end')}</span>
              <span className="font-medium text-foreground">
                {subscription
                  ? subscription.cancelAtPeriodEnd
                    ? tCommon('yes')
                    : tCommon('no')
                  : tCommon('none')}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('sections.agent')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {member.agent ? (
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={member.agent.image || ''} />
                  <AvatarFallback>
                    {(member.agent.name || member.agent.email || 'A')[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-foreground">
                    {member.agent.name || t('labels.unknown')}
                  </p>
                  <p className="text-muted-foreground">{member.agent.email}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4" />
                {t('labels.no_agent')}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('sections.preferences')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {preferences ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('preferences.email_claims')}</span>
                  <Badge variant={preferences.emailClaimUpdates ? 'default' : 'secondary'}>
                    {preferences.emailClaimUpdates ? tCommon('yes') : tCommon('no')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('preferences.email_newsletter')}</span>
                  <Badge variant={preferences.emailNewsletter ? 'default' : 'secondary'}>
                    {preferences.emailNewsletter ? tCommon('yes') : tCommon('no')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('preferences.email_marketing')}</span>
                  <Badge variant={preferences.emailMarketing ? 'default' : 'secondary'}>
                    {preferences.emailMarketing ? tCommon('yes') : tCommon('no')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('preferences.push_claims')}</span>
                  <Badge variant={preferences.pushClaimUpdates ? 'default' : 'secondary'}>
                    {preferences.pushClaimUpdates ? tCommon('yes') : tCommon('no')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('preferences.push_messages')}</span>
                  <Badge variant={preferences.pushMessages ? 'default' : 'secondary'}>
                    {preferences.pushMessages ? tCommon('yes') : tCommon('no')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('preferences.in_app')}</span>
                  <Badge variant={preferences.inAppAll ? 'default' : 'secondary'}>
                    {preferences.inAppAll ? tCommon('yes') : tCommon('no')}
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">{t('labels.preferences_unset')}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('sections.claims_overview')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs text-muted-foreground">{t('claims.total')}</p>
                <p className="text-2xl font-semibold">{counts.total}</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs text-muted-foreground">{t('claims.open')}</p>
                <p className="text-2xl font-semibold">{counts.open}</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs text-muted-foreground">{t('claims.resolved')}</p>
                <p className="text-2xl font-semibold">{counts.resolved}</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs text-muted-foreground">{t('claims.rejected')}</p>
                <p className="text-2xl font-semibold">{counts.rejected}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('sections.recent_claims')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tClaims('table.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentClaims.map(claim => (
                    <TableRow key={claim.id}>
                      <TableCell>
                        <ClaimStatusBadge status={claim.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {recentClaims.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={1} className="h-24 text-center text-muted-foreground">
                        {t('labels.no_claims')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Member Activities Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Member Activity</CardTitle>
            <LogActivityDialog memberId={member.id} />
          </CardHeader>
          <CardContent>
            <ActivityFeed activities={activities} />
          </CardContent>
        </Card>
      </div>

      {/* Member Notes Section */}
      <MemberNotesCard memberId={member.id} memberName={member.name || t('labels.unknown')} />
    </div>
  );
}
