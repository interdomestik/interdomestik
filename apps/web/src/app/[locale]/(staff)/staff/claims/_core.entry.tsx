import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getStaffClaimsList } from '@interdomestik/domain-claims';
import { Button } from '@interdomestik/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StaffClaimsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  await searchParams;
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return notFound();
  if (session.user.role !== 'staff' && session.user.role !== 'branch_manager') {
    return notFound();
  }

  const tClaims = await getTranslations('agent-claims.claims');

  const claims = await getStaffClaimsList({
    staffId: session.user.id,
    tenantId: session.user.tenantId,
    limit: 20,
  });

  return (
    <div className="space-y-6" data-testid="staff-claims-list-ready">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">
          {tClaims('queue')}
        </h1>

        <p className="text-muted-foreground">{tClaims('manage_triage')}</p>
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="grid grid-cols-1 gap-4 border-b px-4 py-3 text-sm font-medium text-muted-foreground md:grid-cols-5">
          <span>{tClaims('table.claim')}</span>
          <span>{tClaims('table.status')}</span>
          <span>{tClaims('table.date')}</span>
          <span>{tClaims('table.claimant')}</span>
          <span className="text-right">{tClaims('table.actions')}</span>
        </div>
        <div className="divide-y">
          {claims.map(claim => (
            <div
              key={claim.id}
              className="grid grid-cols-1 items-center gap-4 px-4 py-3 text-sm md:grid-cols-5"
            >
              <div className="font-medium text-slate-900">{claim.claimNumber || claim.id}</div>
              <div>{claim.stageLabel}</div>
              <div>{claim.updatedAt ? new Date(claim.updatedAt).toLocaleDateString() : '-'}</div>
              <div>{claim.agentName || claim.memberName || '-'}</div>
              <div className="text-right">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/staff/claims/${claim.id}`} data-testid="staff-claims-view">
                    {tClaims('actions.review')}
                  </Link>
                </Button>
              </div>
            </div>
          ))}
          {claims.length === 0 && (
            <div className="px-4 py-10 text-center text-muted-foreground">
              {tClaims('table.no_claims')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
