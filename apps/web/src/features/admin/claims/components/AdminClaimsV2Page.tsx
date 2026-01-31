import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminClaimsFilters } from '@/components/admin/claims/claims-filters';
import { GlassCard } from '@/components/ui/glass-card';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { canViewAdminClaims, getAdminClaimsV2, resolveClaimsVisibility } from '../server';
import type { LifecycleStage } from '../types';
import { ClaimsLifecycleTabs } from './ClaimsLifecycleTabs';
import { ClaimsOperationalList } from './ClaimsOperationalList';
import OpsCenterPage from './ops/OpsCenterPage';

interface AdminClaimsV2PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AdminClaimsV2Page({ searchParams }: AdminClaimsV2PageProps) {
  const t = await getTranslations('admin.claims_page');

  // Get session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Resolve visibility context
  const context = await resolveClaimsVisibility(session);

  if (!context || !canViewAdminClaims(context)) {
    notFound();
  }

  // Parse search params
  const params = await searchParams;
  const viewRaw = params?.view;
  // Handle both string and string[] (Next.js 15 can return arrays for repeated params)
  const view = Array.isArray(viewRaw) ? viewRaw[0] : viewRaw;

  // ROUTING SWITCH
  // Default to Ops Center unless 'list' is explicitly requested
  if (view !== 'list') {
    return <OpsCenterPage searchParams={searchParams} />;
  }

  // --- LEGACY LIST VIEW (view=list) ---
  const page = Number(params?.page || 1);
  const lifecycleParam = params?.lifecycle as string | undefined;
  const lifecycleStage = lifecycleParam as LifecycleStage | undefined;
  const search = params?.search as string | undefined;
  const status = params?.status as string | undefined;
  const assigned = params?.assigned as string | undefined;

  // Fetch data for legacy list
  const data = await getAdminClaimsV2(context, {
    page,
    lifecycleStage,
    search,
    status,
    assigned,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <AdminPageHeader title={t('title')} subtitle={t('description')} />

      <GlassCard className="p-6">
        <div className="space-y-6">
          {/* Filters (Search, Status, Assignment) */}
          <AdminClaimsFilters />

          {/* Lifecycle Tabs */}
          <ClaimsLifecycleTabs stats={data.stats} currentStage={lifecycleStage} />

          {/* Operational List */}
          <ClaimsOperationalList claims={data.rows} />

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-white/5">
              <span className="text-sm text-muted-foreground">
                {t('pagination_info', {
                  page: data.pagination.page,
                  total: data.pagination.totalPages,
                  count: data.pagination.totalCount,
                })}
              </span>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
