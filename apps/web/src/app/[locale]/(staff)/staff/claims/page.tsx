import { AgentClaimsFilters } from '@/components/agent/agent-claims-filters';
import { AgentClaimsTable } from '@/components/agent/agent-claims-table';
import { auth } from '@/lib/auth';
import { redirect } from '@/i18n/routing';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';

export default async function StaffClaimsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect({ href: '/login', locale });
    return null;
  }

  if (session.user.role !== 'staff') {
    if (session.user.role === 'admin') {
      redirect({ href: '/admin', locale });
    } else if (session.user.role === 'agent') {
      redirect({ href: '/agent', locale });
    } else {
      redirect({ href: '/member', locale });
    }
    return null;
  }

  const tClaims = await getTranslations('agent-claims.claims');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{tClaims('queue')}</h1>
        <p className="text-muted-foreground">{tClaims('manage_triage')}</p>
      </div>

      <AgentClaimsFilters />
      <AgentClaimsTable scope="staff_all" detailBasePath="/staff/claims" userRole="staff" />
    </div>
  );
}
