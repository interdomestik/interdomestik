import { getStaff } from '@/actions/admin-users';
import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { ClaimTimelineSection } from '@/features/claims/timeline/components';
import { auth } from '@/lib/auth';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { getNextActions } from '@/features/admin/claims/components/detail/getNextActions';
import { ClaimantInfoCard } from '@/features/admin/claims/components/ops/ClaimantInfoCard';
import { ClaimDescriptionCard } from '@/features/admin/claims/components/ops/ClaimDescriptionCard';
import { ClaimHeader } from '@/features/admin/claims/components/ops/ClaimHeader';
import { EvidencePanel } from '@/features/admin/claims/components/ops/EvidencePanel';
import { NextActionsCard } from '@/features/admin/claims/components/ops/NextActionsCard';
import { getOpsClaimDetail } from '@/features/admin/claims/server/getOpsClaimDetail';

export default async function AdminClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return notFound();

  const tenantId = ensureTenantId(session);
  const result = await getOpsClaimDetail(id);
  if (result.kind === 'not_found') return notFound();

  const data = result.data;

  // Fetch i18n & Context
  // const t = await getTranslations('agent.details'); // Unused
  // const tDetail = await getTranslations('admin.claims_page.detail'); // Unused
  const tTimeline = await getTranslations('admin.claims_page.timeline');
  const staffResult = await getStaff();
  const staff = staffResult.success ? (staffResult.data ?? []) : [];

  // Compute Deterministic Next Actions
  const nextActions = getNextActions(data, session.user.id);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Sticky Ops Header */}
      <ClaimHeader claim={data} allStaff={staff} locale={locale} />

      {/* 3-Pane Cockpit Layout: 3 | 6 | 3 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* LEFT PANE: Context (Claimant, Description, Branch) */}
        <div className="col-span-1 md:col-span-12 lg:col-span-3 flex flex-col gap-6 sticky top-24">
          <ClaimantInfoCard
            memberName={data.memberName}
            memberEmail={data.memberEmail}
            memberNumber={data.memberNumber}
            branchCode={data.branchCode}
            claimAmount={data.claimAmount}
          />

          <ClaimDescriptionCard description={data.description} />
        </div>

        {/* CENTER PANE: Action Workflow */}
        <div className="col-span-1 md:col-span-12 lg:col-span-6 flex flex-col gap-6">
          {/* 1. Next Actions (Primary) */}
          <NextActionsCard
            claim={data}
            nextActions={nextActions}
            locale={locale}
            currentUserId={session.user.id}
            allStaff={staff}
          />

          {/* 2. Messaging (Communication) */}
          <MessagingPanel claimId={data.id} currentUserId={session.user.id} isAgent={true} />

          {/* 3. Timeline (Audit Trail) */}
          <div id="timeline-section">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {tTimeline('title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-20 animate-pulse bg-muted/50 rounded" />}>
                  <ClaimTimelineSection
                    claimId={data.id}
                    tenantId={tenantId}
                    viewerRole="admin"
                    showNotes={true}
                  />
                </Suspense>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* RIGHT PANE: Evidence & Docs */}
        <div className="col-span-1 md:col-span-12 lg:col-span-3 flex flex-col gap-6 sticky top-24">
          {/* Use the new pure EvidencePanel with explicit mapping */}
          <EvidencePanel
            docs={data.docs.map(d => ({
              id: d.id,
              url: d.url,
              name: d.name,
              fileType: d.fileType || 'application/octet-stream',
            }))}
          />
        </div>
      </div>
    </div>
  );
}
