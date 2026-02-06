import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { getStaffClaimsList } from '@interdomestik/domain-claims';
import { Button } from '@interdomestik/ui';
import { setRequestLocale } from 'next-intl/server';
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
  // Pilot policy: branch managers can monitor queue volume, but only staff process claims.
  if (session.user.role !== 'staff' && session.user.role !== 'branch_manager') {
    return notFound();
  }

  const claims = await getStaffClaimsList({
    staffId: session.user.id,
    tenantId: session.user.tenantId,
    limit: 20,
  });

  return (
    <div className="space-y-6" data-testid="staff-page-ready">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">
          Claims Queue
        </h1>

        <p className="text-muted-foreground">What needs action today.</p>
      </div>

      <div className="rounded-lg border bg-white shadow-sm" data-testid="staff-claims-queue">
        <div className="grid grid-cols-1 gap-4 border-b px-4 py-3 text-sm font-medium text-muted-foreground md:grid-cols-5">
          <span>Claim #</span>
          <span>Member</span>
          <span>Status + stage</span>
          <span>Updated</span>
          <span className="text-right">Action</span>
        </div>
        <div className="divide-y" data-testid="staff-claims-list">
          {claims.map(claim => (
            <div
              key={claim.id}
              className="grid grid-cols-1 items-center gap-4 px-4 py-3 text-sm md:grid-cols-5"
              data-testid="staff-claims-row"
            >
              <div className="font-medium text-slate-900">{claim.claimNumber || claim.id}</div>
              <div>
                <div className="font-medium text-slate-900">{claim.memberName || '-'}</div>
                <div className="text-xs text-muted-foreground">
                  {claim.memberNumber ? `#${claim.memberNumber}` : 'No member number'}
                </div>
              </div>
              <div>
                {claim.status || 'unknown'} / {claim.stageLabel}
              </div>
              <div>
                {claim.updatedAt ? new Date(claim.updatedAt).toLocaleDateString(locale) : '-'}
              </div>
              <div className="text-right">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/staff/claims/${claim.id}`} data-testid="staff-claims-view">
                    Open
                  </Link>
                </Button>
              </div>
            </div>
          ))}
          {claims.length === 0 && (
            <div
              className="px-4 py-10 text-center text-muted-foreground"
              data-testid="staff-claims-empty"
            >
              No claims in queue
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
