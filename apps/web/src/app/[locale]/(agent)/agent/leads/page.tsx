import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { Button } from '@interdomestik/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAgentLeadsCore } from './_core';

export default async function LeadsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('agent-crm.crm.leads');
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/auth/login');
  }

  const leads = await getAgentLeadsCore({ agentId: session.user.id });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/agent/leads/new">Add Lead</Link>
        </Button>
      </div>

      <div className="rounded-md border bg-white overflow-hidden">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('table.name')}
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('table.stage')}
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('table.source')}
                </th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('table.last_contact')}
                </th>
                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">
                  {t('table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">
                    No leads found. Start by adding one!
                  </td>
                </tr>
              ) : (
                leads.map(lead => (
                  <tr key={lead.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="p-4 align-middle font-medium">{lead.fullName || 'Unknown'}</td>
                    <td className="p-4 align-middle">
                      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                        {t(`stages.${lead.stage}` as 'stages.new')}
                      </span>
                    </td>
                    <td className="p-4 align-middle">{lead.source}</td>
                    <td className="p-4 align-middle">
                      {lead.lastContactedAt
                        ? new Date(lead.lastContactedAt).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="p-4 align-middle text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/agent/leads/${lead.id}`}>View</Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
