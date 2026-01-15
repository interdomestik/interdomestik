// Phase 2.8: Ops Center Page Component (RSC)
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { GlassCard } from '@/components/ui/glass-card';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

import { canViewAdminClaims, getOpsCenterData, resolveClaimsVisibility } from '../../server';
import type { OpsCenterFilters, OpsPoolAnchor } from '../../types';
import { KPIHeader } from './KPIHeader';
import { OpsDashboard } from './OpsDashboard';

interface OpsCenterPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Parse pool anchor from searchParams.
 */
function parsePoolAnchor(
  params: Record<string, string | string[] | undefined>
): OpsPoolAnchor | undefined {
  const anchorStr = params?.poolAnchor as string | undefined;
  if (!anchorStr) return undefined;
  try {
    const [updatedAt, id] = anchorStr.split('|');
    if (updatedAt && id) return { updatedAt, id };
  } catch {
    // Invalid anchor, ignore
  }
  return undefined;
}

/**
 * OpsCenterPage — Main RSC layout for Ops Center.
 * Phase 2.8 implementation with pool anchor support.
 */
export default async function OpsCenterPage({ searchParams }: OpsCenterPageProps) {
  try {
    const t = await getTranslations('admin.claims_page');

    // Auth + visibility
    const session = await auth.api.getSession({ headers: await headers() });
    const context = await resolveClaimsVisibility(session);

    if (!context || !canViewAdminClaims(context)) {
      return (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          {t('access_denied')}
        </div>
      );
    }

    // Parse filters from searchParams
    const params = await searchParams;
    const page = Number(params?.page ?? 0);
    const poolAnchor = parsePoolAnchor(params);

    const filters: OpsCenterFilters = {
      lifecycle: params?.lifecycle as OpsCenterFilters['lifecycle'],
      priority: params?.priority as OpsCenterFilters['priority'],
      assignee: params?.assignee as OpsCenterFilters['assignee'],
      branch: params?.branch as string | undefined,
      page,
      poolAnchor,
    };

    // Fetch ops center data (KPIs + prioritized)
    const data = await getOpsCenterData(context, filters);

    return (
      <div className="space-y-0 animate-in fade-in duration-500" data-testid="ops-center-page">
        <AdminPageHeader title={t('ops_center.title')} />

        {/* Sticky KPI Header with Refresh */}
        <KPIHeader kpis={data.kpis} fetchedAt={data.fetchedAt} />

        {/* 3-Pane Layout (OpsDashboard Shell) */}
        <GlassCard className="mt-4 p-0 overflow-hidden">
          <OpsDashboard
            kpis={data.kpis}
            claims={data.prioritized}
            hasMore={data.hasMore}
            page={page}
            assignees={data.assignees}
            unassignedSummary={data.unassignedSummary}
            meSummary={data.meSummary}
          />
        </GlassCard>
      </div>
    );
  } catch (error: any) {
    console.error('OpsCenterPage Crashed:', error);
    return (
      <div
        className="p-8 text-red-500 bg-red-500/10 rounded-lg border border-red-500/20"
        data-testid="error-boundary"
      >
        <h1 className="text-xl font-bold">Ops Center Crashed</h1>
        <pre className="mt-2 text-xs overflow-auto">{error.message}</pre>
        <pre className="mt-1 text-xs opacity-50 text-muted-foreground">{error.stack}</pre>
      </div>
    );
  }
}
