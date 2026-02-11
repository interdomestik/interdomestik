import { getStaffClaimDetail } from '@interdomestik/domain-claims';
import { claimStageHistory, db } from '@interdomestik/database';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { auth } from '@/lib/auth';
import { ClaimActionPanel } from '@/components/staff/claim-action-panel';

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

  const detail = await getStaffClaimDetail({
    staffId: session.user.id,
    tenantId: session.user.tenantId,
    claimId: id,
  });

  if (!detail) return notFound();

  const latestStatusNote = await db.query.claimStageHistory.findFirst({
    where: and(
      eq(claimStageHistory.claimId, id),
      eq(claimStageHistory.tenantId, session.user.tenantId),
      eq(claimStageHistory.isPublic, true),
      isNotNull(claimStageHistory.note)
    ),
    columns: {
      note: true,
      createdAt: true,
    },
    orderBy: [desc(claimStageHistory.createdAt)],
  });

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

      {session.user.role === 'staff' && (
        <section
          className="rounded-lg border bg-white p-4"
          data-testid="staff-claim-detail-actions"
        >
          <ClaimActionPanel
            claimId={detail.claim.id}
            currentStatus={detail.claim.status || 'draft'}
            staffId={session.user.id}
            assigneeId={detail.claim.staffId}
          />
        </section>
      )}
    </div>
  );
}
