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

// Helper to safe-read params as string
function sp(
  params: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminClaimsV2Page({ searchParams }: AdminClaimsV2PageProps) {
  const t = await getTranslations('admin.claims_page');

  const session = await auth.api.getSession({ headers: await headers() });
  const context = await resolveClaimsVisibility(session);
  if (!context || !canViewAdminClaims(context)) notFound();

  const params = await searchParams;

  // ✅ Default to list; ops must be explicit
  const view = sp(params, 'view') ?? 'list';
  if (view === 'ops') {
    return <OpsCenterPage searchParams={searchParams} />;
  }

  // List View (Default)
  const page = Number(sp(params, 'page') ?? '1');
  const lifecycleStage = sp(params, 'lifecycle') as LifecycleStage | undefined;
  const search = sp(params, 'search');
  const status = sp(params, 'status');
  const assigned = sp(params, 'assigned');

  const data = await getAdminClaimsV2(context, { page, lifecycleStage, search, status, assigned });

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="admin-claims-v2-ready">
      <AdminPageHeader title={t('title')} subtitle={t('description')} />
      <GlassCard className="p-6">
        <div className="space-y-6">
          <AdminClaimsFilters />
          <ClaimsLifecycleTabs stats={data.stats} currentStage={lifecycleStage} />
          <ClaimsOperationalList claims={data.rows} />
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
