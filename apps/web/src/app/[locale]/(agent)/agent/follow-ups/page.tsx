import { FollowUpActions } from '@/features/agent/leads/components/FollowUpActions';
import { auth } from '@/lib/auth';
import { and, db, eq, memberFollowups } from '@interdomestik/database';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@interdomestik/ui';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function AgentFollowUpsPage(props: {
  searchParams: Promise<{ status?: string }>;
}) {
  const t = await getTranslations('agent');
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  const searchParams = await props.searchParams;
  const uiStatus = (searchParams.status === 'done' ? 'done' : 'pending') as 'pending' | 'done';
  const dbStatus = (uiStatus === 'done' ? 'completed' : 'pending') as 'pending' | 'completed';

  const followups = await db.query.memberFollowups.findMany({
    where: and(eq(memberFollowups.agentId, session.user.id), eq(memberFollowups.status, dbStatus)),
    with: {
      member: {
        columns: {
          name: true,
          email: true,
          memberNumber: true,
        },
      },
    },
    orderBy: (f, { asc, desc }) => [dbStatus === 'completed' ? desc(f.updatedAt) : asc(f.dueAt)],
  });

  return (
    <div className="space-y-6" data-testid="agent-followups-page-ready">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('followUpsTitle')}</h1>
      </div>

      <Tabs defaultValue={uiStatus} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="pending" asChild data-testid="tab-pending">
            <Link href="?status=pending">{t('follow_ups.tabs.pending')}</Link>
          </TabsTrigger>
          <TabsTrigger value="done" asChild data-testid="tab-done">
            <Link href="?status=done">{t('follow_ups.tabs.done')}</Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={uiStatus} className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t('follow_ups.dueForAction')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('leads_list.table.firstName')}</TableHead>
                    <TableHead>{t('leads_list.table.status')}</TableHead>
                    <TableHead>{t('follow_ups.note')}</TableHead>
                    <TableHead className="text-right">{t('leads_list.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {followups.map(item => (
                    <TableRow key={item.id} data-testid={`followup-row-${item.id}`}>
                      <TableCell className="font-medium">
                        {item.member?.name ||
                          item.member?.memberNumber ||
                          item.member?.email ||
                          'Unknown Member'}
                      </TableCell>
                      <TableCell>
                        <span className="capitalize">{t(`follow_ups.status.${item.status}`)}</span>
                      </TableCell>
                      <TableCell>{item.note}</TableCell>
                      <TableCell className="text-right">
                        {item.status === 'pending' && <FollowUpActions leadId={item.id} />}
                      </TableCell>
                    </TableRow>
                  ))}
                  {followups.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground p-4">
                        {t('follow_ups.noFollowUps')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        {/* We keep 'failed' content empty, or duplicate logic. 
            Since we navigate, the currentStatus changes, so we always render into the active tab content area. 
        */}
      </Tabs>
    </div>
  );
}
