import { getAgentUsers } from '@/actions/agent-users';
import { getAgentDashboardData } from '@/actions/agent-dashboard';
import { AgentStatsCards } from '@/components/agent/agent-stats-cards';
import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Link } from '@/i18n/routing';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@interdomestik/ui';
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Activity, ArrowRight, FileText, Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function AgentDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('agent');
  const tMembers = await getTranslations('agent.members_panel');
  const tUsers = await getTranslations('agent.users_table');
  const { stats, recentClaims } = await getAgentDashboardData();
  const members = await getAgentUsers();

  const attentionMembers = members.filter(member => member.unreadCount);
  const highlightedMembers = attentionMembers.length > 0 ? attentionMembers : members;
  const displayedMembers = highlightedMembers.slice(0, 5);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('dashboard')} -{' '}
            {new Date().toLocaleDateString(locale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <Button asChild>
          <Link href="/agent/claims">
            {t('claims_queue')} <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <AgentStatsCards stats={stats} />

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>{t('table.recent_activity', { defaultValue: 'Recent Activity' })}</CardTitle>
            <CardDescription>
              {recentClaims.length === 0
                ? t('table.no_claims')
                : 'Your most recently updated cases.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {recentClaims.map(claim => (
                <div key={claim.id} className="flex items-center gap-4">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">{claim.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {claim.user?.name || 'Unknown User'} • {claim.companyName}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <ClaimStatusBadge status={claim.status} />
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/agent/claims/${claim.id}`}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
              {recentClaims.length === 0 && (
                <div className="py-10 text-center text-muted-foreground opacity-50">
                  <Activity className="h-10 w-10 mx-auto mb-3" />
                  <p>{t('table.no_claims')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              {tMembers('title')}
            </CardTitle>
            <CardDescription>{tMembers('description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {displayedMembers.map(member => (
                <div key={member.id} className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={member.image || ''} />
                    <AvatarFallback>{member.name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{member.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  {member.unreadCount && member.alertLink ? (
                    <Button
                      asChild
                      size="sm"
                      className="gap-2 animate-pulse bg-amber-500 text-white hover:bg-amber-600"
                    >
                      <Link href={member.alertLink}>
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                        </span>
                        {tUsers('message_alert', { count: member.unreadCount })}
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/agent/users/${member.id}`}>{tUsers('view_profile')}</Link>
                    </Button>
                  )}
                </div>
              ))}
              {displayedMembers.length === 0 && (
                <div className="py-10 text-center text-muted-foreground opacity-70">
                  <p>{tMembers('empty')}</p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href="/agent/users">{tMembers('view_all')}</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader>
            <CardTitle>{t('details.notes', { defaultValue: 'Workspace Notes' })}</CardTitle>
            <CardDescription>Quick reminders and private workspace notes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-900 text-sm">
                <p className="font-semibold mb-1">{t('notes.priority')}</p>
                <p className="opacity-80">
                  All claims from Interdomestik Insurance need to be verified within 24 hours.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm">
                <p className="font-semibold mb-1">{t('notes.deadline')}</p>
                <p className="opacity-80">
                  End of quarter reporting starts on Monday. Ensure all resolved cases are
                  documented.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
