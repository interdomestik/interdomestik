import { getAdminOverviewData } from '@/features/admin/overview/server/get-admin-overview-data';
import { getSessionSafe } from '@/components/shell/session';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.overview_page');

  const session = await getSessionSafe('AdminOverviewPage');
  if (!session) return notFound();
  if (
    session.user.role !== 'admin' &&
    session.user.role !== 'super_admin' &&
    session.user.role !== 'tenant_admin' &&
    session.user.role !== 'branch_manager'
  ) {
    return notFound();
  }

  const overview = await getAdminOverviewData({
    tenantId: session.user.tenantId,
  });

  return (
    <div data-testid="admin-page-ready" className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </header>

      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        data-testid="admin-overview-kpis"
      >
        <article
          className="rounded-lg border bg-white p-4"
          data-testid="admin-overview-kpi-members"
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('kpis_total_members')}
          </p>
          <p className="mt-2 text-3xl font-semibold">{overview.kpis.totalMembers}</p>
        </article>
        <article className="rounded-lg border bg-white p-4" data-testid="admin-overview-kpi-agents">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('kpis_total_agents')}
          </p>
          <p className="mt-2 text-3xl font-semibold">{overview.kpis.totalAgents}</p>
        </article>
        <article
          className="rounded-lg border bg-white p-4"
          data-testid="admin-overview-kpi-active-claims"
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('kpis_total_active_claims')}
          </p>
          <p className="mt-2 text-3xl font-semibold">{overview.kpis.totalActiveClaims}</p>
        </article>
        <article
          className="rounded-lg border bg-white p-4"
          data-testid="admin-overview-kpi-updated-24h"
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('kpis_claims_updated_24h')}
          </p>
          <p className="mt-2 text-3xl font-semibold">{overview.kpis.claimsUpdatedLast24h}</p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="rounded-lg border bg-white p-4" data-testid="admin-overview-by-stage">
          <h2 className="text-base font-semibold">{t('claims_by_stage')}</h2>
          <div className="mt-3 space-y-2">
            {overview.claimsByStage.map(item => (
              <div
                key={item.stage}
                className="flex items-center justify-between text-sm"
                data-testid="admin-overview-stage-row"
              >
                <span className="capitalize">{item.stage}</span>
                <span className="font-medium">{item.count}</span>
              </div>
            ))}
            {overview.claimsByStage.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="admin-overview-stage-empty">
                {t('no_active_claims')}
              </p>
            ) : null}
          </div>
        </article>

        <article className="rounded-lg border bg-white p-4" data-testid="admin-overview-by-branch">
          <h2 className="text-base font-semibold">{t('claims_by_branch')}</h2>
          <div className="mt-3 space-y-2">
            {overview.claimsByBranch.map(item => (
              <div
                key={`${item.branchId ?? 'unassigned'}-${item.branchName}`}
                className="flex items-center justify-between text-sm"
                data-testid="admin-overview-branch-row"
              >
                <span>{item.branchName}</span>
                <span className="font-medium">{item.count}</span>
              </div>
            ))}
            {overview.claimsByBranch.length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="admin-overview-branch-empty"
              >
                {t('no_branch_accumulation')}
              </p>
            ) : null}
          </div>
        </article>
      </section>
    </div>
  );
}
