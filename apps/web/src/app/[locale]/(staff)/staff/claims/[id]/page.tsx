import { getStaffClaimDetail } from '@interdomestik/domain-claims';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { auth } from '@/lib/auth';
import { ClaimActionPanel } from '@/components/staff/claim-action-panel';
import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { getStaffAssignmentOptions } from '@/features/staff/claims/assignment-options';
import { getLatestPublicStatusNoteCore } from './_core';

interface PageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

export default async function StaffClaimDetailsPage({ params }: PageProps) {
  const { id, locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return notFound();
  // Pilot policy: branch managers have read-only visibility; claim actions remain staff-only.
  if (session.user.role !== 'staff' && session.user.role !== 'branch_manager') {
    return notFound();
  }

  const [detail, latestStatusNote, assignmentOptions] = await Promise.all([
    getStaffClaimDetail({
      claimId: id,
      staffId: session.user.id,
      tenantId: session.user.tenantId,
    }),
    getLatestPublicStatusNoteCore({
      claimId: id,
      tenantId: session.user.tenantId,
    }),
    session.user.role === 'staff'
      ? getStaffAssignmentOptions({
          branchId: session.user.branchId ?? null,
          tenantId: session.user.tenantId,
        })
      : Promise.resolve([]),
  ]);

  if (!detail) return notFound();

  const currentAssigneeLabel =
    assignmentOptions.find(option => option.id === detail.claim.staffId)?.label ?? null;

  return (
    <div className="space-y-6" data-testid="staff-claim-detail-ready">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">
          {detail.claim.claimNumber || detail.claim.id}
        </h1>
        <p className="text-muted-foreground">{detail.claim.stageLabel}</p>
      </div>

      <section className="rounded-lg border bg-white p-4" data-testid="staff-claim-detail-claim">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Claim
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Status</span>
            <div className="font-medium text-slate-900">{detail.claim.stageLabel}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Updated</span>
            <div className="font-medium text-slate-900">
              {detail.claim.updatedAt ? new Date(detail.claim.updatedAt).toLocaleDateString() : '-'}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Submitted</span>
            <div className="font-medium text-slate-900">
              {detail.claim.submittedAt
                ? new Date(detail.claim.submittedAt).toLocaleDateString()
                : '-'}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4" data-testid="staff-claim-detail-member">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Member
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Name</span>
            <div className="font-medium text-slate-900">{detail.member.fullName}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Membership #</span>
            <div className="font-medium text-slate-900">
              {detail.member.membershipNumber || '-'}
            </div>
          </div>
        </div>
      </section>

      {detail.matterAllowance ? (
        <section
          className="rounded-lg border bg-white p-4"
          data-testid="staff-claim-detail-matter-allowance"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Matter allowance
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
            <div>
              <span className="text-muted-foreground">Used this year</span>
              <div
                className="font-medium text-slate-900"
                data-testid="staff-claim-detail-matter-allowance-used"
              >
                {detail.matterAllowance.consumedCount}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Remaining this year</span>
              <div
                className="font-medium text-slate-900"
                data-testid="staff-claim-detail-matter-allowance-remaining"
              >
                {detail.matterAllowance.remainingCount}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Plan allowance</span>
              <div
                className="font-medium text-slate-900"
                data-testid="staff-claim-detail-matter-allowance-total"
              >
                {detail.matterAllowance.allowanceTotal}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border bg-white p-4" data-testid="staff-claim-detail-agent">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Agent
        </h2>
        <div className="mt-3 text-sm">
          {detail.agent ? (
            <div className="font-medium text-slate-900">{detail.agent.name}</div>
          ) : (
            <div className="text-muted-foreground">Unassigned</div>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4" data-testid="staff-claim-detail-note">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Latest status note
        </h2>
        <div className="mt-3 space-y-1 text-sm">
          {latestStatusNote?.note ? (
            <>
              <p className="whitespace-pre-wrap text-slate-900">{latestStatusNote.note}</p>
              <p className="text-xs text-muted-foreground">
                {latestStatusNote.createdAt
                  ? new Date(latestStatusNote.createdAt).toLocaleString()
                  : ''}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">No public status notes yet.</p>
          )}
        </div>
      </section>

      {session.user.role === 'staff' ? (
        <section
          className="rounded-lg border bg-white p-4"
          data-testid="staff-claim-detail-messaging"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Messages
          </h2>
          <div className="mt-3">
            <MessagingPanel
              claimId={detail.claim.id}
              currentUser={{
                id: session.user.id,
                name: session.user.name ?? 'Staff',
                image: session.user.image ?? null,
                role: session.user.role || 'staff',
              }}
              allowInternal={true}
            />
          </div>
        </section>
      ) : null}

      {session.user.role === 'staff' && (
        <section
          className="rounded-lg border bg-white p-4"
          data-testid="staff-claim-detail-actions"
        >
          <ClaimActionPanel
            acceptedRecoveryPrerequisites={detail.acceptedRecoveryPrerequisites}
            claimId={detail.claim.id}
            recoveryDecision={detail.recoveryDecision}
            commercialAgreement={detail.commercialAgreement}
            successFeeCollection={detail.successFeeCollection}
            currentStatus={detail.claim.status || 'draft'}
            staffId={session.user.id}
            assigneeId={detail.claim.staffId}
            assignmentOptions={assignmentOptions}
            currentAssigneeLabel={currentAssigneeLabel}
          />
        </section>
      )}
    </div>
  );
}
