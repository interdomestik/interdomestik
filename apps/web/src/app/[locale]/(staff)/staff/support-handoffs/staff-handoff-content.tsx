import { and, eq, user } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { getStaffSupportHandoffQueue } from '@interdomestik/domain-claims/support-handoffs/queue';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { resolveStaffSupportSessionBranch } from '@/lib/support-handoffs/staff-session';
import { getContentTranslations, handoffContentPresentation } from './staff-handoff-content-model';
import { StaffHandoffContentFilters } from './staff-handoff-content-filters';
import { StaffHandoffContentRow } from './staff-handoff-content-row';

export type HandoffContentProps = {
  authority: TenantAuthority;
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getAssignableStaff(args: { branchId: string | null; authority: TenantAuthority }) {
  const { tenantId } = readTenantAuthority(args.authority);
  return withTenantAuthority(args.authority, tx =>
    tx.query.user.findMany({
      where: withTenant(
        tenantId,
        user.tenantId,
        args.branchId
          ? and(eq(user.role, 'staff'), eq(user.branchId, args.branchId))
          : eq(user.role, 'staff')
      ),
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    })
  );
}

export default async function StaffHandoffContent({
  authority,
  params,
  searchParams,
}: HandoffContentProps) {
  const { tenantId, accessTenantId, purpose, principal } = readTenantAuthority(authority);
  if (
    purpose !== 'session' ||
    tenantId !== accessTenantId ||
    !principal?.userId ||
    principal.role !== 'staff'
  )
    return notFound();
  const staffSession = await resolveStaffSupportSessionBranch(
    {
      user: {
        id: principal.userId,
        role: principal.role,
        branchId: principal.branchId,
        tenantId,
      },
    },
    authority
  );
  if (!staffSession) return notFound();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getContentTranslations();
  const presentation = handoffContentPresentation(t, principal.role, await searchParams);
  const {
    currentAssignment,
    currentAttention,
    currentClaim,
    currentStatus,
    currentUrgency,
    currentSearch,
  } = presentation;
  const queue = await getStaffSupportHandoffQueue({
    assignment: currentAssignment,
    attention: currentAttention,
    branchId: staffSession.user.branchId,
    claimLink: currentClaim,
    limit: 30,
    search: currentSearch,
    staffId: principal.userId,
    status: currentStatus,
    authority,
    urgency: currentUrgency,
    viewerRole: principal.role,
  });
  const staffOptions = queue.some(handoff => handoff.status === 'accepted')
    ? await getAssignableStaff({ branchId: staffSession.user.branchId, authority })
    : [];
  return (
    <div className="space-y-6" data-testid="staff-page-ready">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">
          {t('title')}
        </h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>
      <StaffHandoffContentFilters locale={locale} t={t} presentation={presentation} />
      <div
        className="rounded-lg border bg-white shadow-sm"
        data-testid="staff-support-handoffs-queue"
      >
        <div className="grid grid-cols-1 gap-4 border-b px-4 py-3 text-sm font-medium text-muted-foreground md:grid-cols-6">
          <span>{t('table.request')}</span>
          <span>{t('table.member')}</span>
          <span>{t('table.relationship')}</span>
          <span>{t('table.risk')}</span>
          <span>{t('table.owner')}</span>
          <span className="text-right">{t('table.actions')}</span>
        </div>
        <div className="divide-y" data-testid="staff-support-handoffs-list">
          {queue.map(handoff => (
            <StaffHandoffContentRow
              key={handoff.id}
              handoff={handoff}
              staffId={staffSession.user.id}
              viewerRole={staffSession.user.role}
              staffOptions={staffOptions}
              t={t}
              locale={locale}
              currentAttention={currentAttention}
              detailLabels={presentation.detailLabels}
            />
          ))}
          {queue.length === 0 ? (
            <div
              className="px-4 py-10 text-center text-muted-foreground"
              data-testid="staff-support-handoffs-empty"
            >
              {t('empty')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
