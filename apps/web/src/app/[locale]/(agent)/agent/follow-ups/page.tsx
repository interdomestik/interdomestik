import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { memberLeads } from '@interdomestik/database/schema';
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
} from '@interdomestik/ui';
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AgentFollowUpsPage() {
  const t = await getTranslations('agent');
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  const leads = await db
    .select()
    .from(memberLeads)
    .where(
      and(
        eq(memberLeads.agentId, session.user.id),
        isNotNull(memberLeads.nextStepAt),
        lte(memberLeads.nextStepAt, new Date())
      )
    );

  return (
    <div className="space-y-6" data-testid="agent-followups-page-ready">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('followUpsTitle')}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Due for Action</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('leads_list.table.firstName')}</TableHead>
                <TableHead>{t('leads_list.table.lastName')}</TableHead>
                <TableHead>{t('leads_list.table.status')}</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map(lead => (
                <TableRow key={lead.id} data-testid={`followup-row-${lead.id}`}>
                  <TableCell>{lead.firstName}</TableCell>
                  <TableCell>{lead.lastName}</TableCell>
                  <TableCell>{lead.status}</TableCell>
                  <TableCell>{lead.nextStepNote}</TableCell>
                </TableRow>
              ))}
              {leads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground p-4">
                    No follow-ups due.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
