import { getInformationRequests, getStaffClaimDetail } from '@interdomestik/domain-claims';
import { ClaimInformationRequestForm } from '@/features/staff/claims/components/ClaimInformationRequestForm';
import { ClaimInformationRequests } from '@/features/member/claims/components/ClaimInformationRequests';
import {
  StaffClaimContext,
  type StaffClaimContextGroup,
} from '@/features/staff/claims/components/StaffClaimContext';
import {
  StaffClaimWorkspaceHeader,
  type StaffClaimSectionLink,
} from '@/features/staff/claims/components/StaffClaimWorkspaceHeader';
import { StaffStatusHistory } from '@/features/staff/claims/components/StaffStatusHistory';
import { deriveClaimSlaPhase } from '@/features/claims/policy';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ClaimActionPanel } from '@/components/staff/claim-action-panel';
import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { getMessagesForClaimCore } from '@/actions/messages/get.core';
import { getStaffAssignmentOptions } from '@/features/staff/claims/assignment-options';
import { getPublicStatusHistoryCore } from './_core';

const SECTION_HANDLING = 'staff-claim-handling';
const SECTION_REQUESTS = 'staff-claim-requests';
const SECTION_MESSAGES = 'staff-claim-messages';
const SECTION_CONTEXT = 'staff-claim-context';
// StaffStatusHistory owns this anchor; the workspace only links to it.
const SECTION_HISTORY = 'staff-status-history';
const SECTION_HEADING = 'text-sm font-semibold uppercase tracking-wide text-muted-foreground';

interface PageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

function toClaimStatus(value: unknown): ClaimStatus {
  return CLAIM_STATUSES.includes(value as ClaimStatus) ? (value as ClaimStatus) : 'draft';
}

function formatDate(value: unknown, locale: string): string {
  if (!value) return '-';
  return (value instanceof Date ? value : new Date(String(value))).toLocaleDateString(locale);
}

export default async function StaffClaimDetailsPage({ params }: PageProps) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  const tClaims = await getTranslations('agent-claims.claims');
  const tStatus = await getTranslations('claims-tracking.status');

  const session = requireSessionOrRedirect(await getSessionSafe('StaffClaimDetailsPage'), locale);
  // Pilot policy: branch managers have read-only visibility; claim actions remain staff-only.
  if (session.user.role !== 'staff' && session.user.role !== 'branch_manager') {
    return notFound();
  }

  const detail = await getStaffClaimDetail({
    branchId: session.user.branchId ?? null,
    claimId: id,
    staffId: session.user.id,
    tenantId: session.user.tenantId,
  });

  if (!detail) return notFound();

  const [statusHistory, assignmentOptions, initialMessagesResult] = await Promise.all([
    getPublicStatusHistoryCore({
      claimId: id,
      tenantId: session.user.tenantId,
    }),
    session.user.role === 'staff'
      ? getStaffAssignmentOptions({
          branchId: session.user.branchId ?? null,
          tenantId: session.user.tenantId,
        })
      : Promise.resolve([]),
    session.user.role === 'staff'
      ? getMessagesForClaimCore({
          session,
          claimId: id,
        })
      : Promise.resolve({ success: true as const, messages: [] }),
  ]);

  const currentAssigneeLabel =
    assignmentOptions.find(option => option.id === detail.claim.staffId)?.label ?? null;
  const initialMessages = initialMessagesResult.success
    ? (initialMessagesResult.messages ?? [])
    : [];
  const claimStatus = toClaimStatus(detail.claim.status);
  const slaPhase = deriveClaimSlaPhase(claimStatus);
  const informationRequests = await getInformationRequests(session, id).catch(() => null);

  const isStaff = session.user.role === 'staff';
  const isAssignedStaff = isStaff && detail.claim.staffId === session.user.id;
  // Phase derivation stays operative; only this route's generic verification copy is neutral so it
  // never implies an outstanding member duty. The request card remains the source of real duties.
  const slaPhaseLabel =
    claimStatus === 'verification' && slaPhase === 'incomplete'
      ? tClaims('details.verification_guidance')
      : tClaims(`details.sla_phase.${slaPhase}`);

  const sections: readonly StaffClaimSectionLink[] = [
    ...(isStaff ? [{ id: SECTION_HANDLING, label: tClaims('details.workspace.handling') }] : []),
    { id: SECTION_REQUESTS, label: tClaims('details.workspace.requests') },
    ...(isStaff ? [{ id: SECTION_MESSAGES, label: tClaims('details.messages') }] : []),
    { id: SECTION_CONTEXT, label: tClaims('details.workspace.context') },
    { id: SECTION_HISTORY, label: tClaims('details.workspace.history') },
  ];

  const contextGroups: readonly (StaffClaimContextGroup | null)[] = [
    {
      testId: 'staff-claim-detail-claim',
      title: tClaims('details.staff_claim.section_title'),
      fields: [
        { label: tClaims('details.staff_claim.status'), value: tStatus(claimStatus) },
        {
          label: tClaims('details.staff_claim.updated'),
          value: formatDate(detail.claim.updatedAt, locale),
        },
        {
          label: tClaims('details.staff_claim.submitted'),
          value: formatDate(detail.claim.submittedAt, locale),
        },
      ],
    },
    {
      testId: 'staff-claim-detail-member',
      title: tClaims('details.staff_member.section_title'),
      fields: [
        { label: tClaims('details.name'), value: detail.member.fullName },
        {
          label: tClaims('details.staff_member.membership_number'),
          value: detail.member.membershipNumber || '-',
        },
      ],
    },
    detail.matterAllowance
      ? {
          columns: 'md:grid-cols-3',
          testId: 'staff-claim-detail-matter-allowance',
          title: tClaims('details.staff_matter_allowance.section_title'),
          fields: [
            {
              label: tClaims('details.staff_matter_allowance.used_this_year'),
              testId: 'staff-claim-detail-matter-allowance-used',
              value: String(detail.matterAllowance.consumedCount),
            },
            {
              label: tClaims('details.staff_matter_allowance.remaining_this_year'),
              testId: 'staff-claim-detail-matter-allowance-remaining',
              value: String(detail.matterAllowance.remainingCount),
            },
            {
              label: tClaims('details.staff_matter_allowance.plan_allowance'),
              testId: 'staff-claim-detail-matter-allowance-total',
              value: String(detail.matterAllowance.allowanceTotal),
            },
          ],
        }
      : null,
    slaPhase !== 'not_applicable'
      ? {
          note: { testId: 'staff-claim-detail-sla-phase', value: slaPhaseLabel },
          testId: 'staff-claim-detail-sla',
          title: tClaims('details.sla_status_label'),
        }
      : null,
    {
      note: detail.agent
        ? { value: detail.agent.name }
        : { muted: true, value: tClaims('staff_queue.assignment_state.unassigned') },
      testId: 'staff-claim-detail-agent',
      title: tClaims('details.staff_agent.section_title'),
    },
  ];

  return (
    <div className="space-y-6" data-testid="staff-claim-detail-ready">
      <StaffClaimWorkspaceHeader
        backHref={`/${locale}/staff/claims`}
        backLabel={tClaims('details.workspace.back')}
        caseReference={detail.claim.claimNumber || detail.claim.id}
        navLabel={tClaims('details.workspace.nav_label')}
        referenceLabel={tClaims('details.workspace.reference_label')}
        sections={sections}
        statusLabel={tStatus(claimStatus)}
      />

      {session.user.role === 'branch_manager' ? (
        <section
          className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"
          data-testid="staff-claim-readonly-notice"
        >
          {tClaims('details.branch_manager_readonly_notice')}
        </section>
      ) : null}

      {isStaff ? (
        <section
          aria-labelledby={`${SECTION_HANDLING}-title`}
          className="rounded-lg border bg-white p-3 sm:p-4"
          data-testid="staff-claim-detail-actions"
          id={SECTION_HANDLING}
        >
          <h2 className={SECTION_HEADING} id={`${SECTION_HANDLING}-title`}>
            {tClaims('details.workspace.handling')}
          </h2>
          <div className="mt-3">
            <ClaimActionPanel
              acceptedRecoveryPrerequisites={detail.acceptedRecoveryPrerequisites}
              claimId={detail.claim.id}
              recoveryDecision={detail.recoveryDecision}
              commercialAgreement={detail.commercialAgreement}
              successFeeCollection={detail.successFeeCollection}
              currentStatus={claimStatus}
              staffId={session.user.id}
              assigneeId={detail.claim.staffId}
              assignmentOptions={assignmentOptions}
              currentAssigneeLabel={currentAssigneeLabel}
              density="compact"
            />
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby={`${SECTION_REQUESTS}-title`}
        className="space-y-4"
        data-testid="staff-claim-requests"
        id={SECTION_REQUESTS}
      >
        <h2 className={SECTION_HEADING} id={`${SECTION_REQUESTS}-title`}>
          {tClaims('details.workspace.requests')}
        </h2>
        {isAssignedStaff && claimStatus === 'verification' ? (
          <ClaimInformationRequestForm claimId={id} />
        ) : null}
        <ClaimInformationRequests
          audience="staff"
          canAcknowledge={isAssignedStaff}
          claimId={id}
          requests={informationRequests}
        />
      </section>

      {isStaff ? (
        <section
          aria-labelledby={`${SECTION_MESSAGES}-title`}
          className="rounded-lg border bg-white p-3 sm:p-4"
          data-testid="staff-claim-detail-messaging"
          id={SECTION_MESSAGES}
        >
          <h2 className={SECTION_HEADING} id={`${SECTION_MESSAGES}-title`}>
            {tClaims('details.messages')}
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
              initialMessages={initialMessages}
              fetchOnMount={false}
            />
          </div>
        </section>
      ) : null}

      <StaffClaimContext
        groups={contextGroups}
        sectionId={SECTION_CONTEXT}
        title={tClaims('details.workspace.context')}
      />

      <StaffStatusHistory
        statusHistory={statusHistory}
        locale={locale}
        latestTitle={tClaims('details.staff_note.section_title')}
        emptyLabel={tClaims('details.staff_note.empty')}
        historyTitle={tClaims('details.staff_note.history_title')}
        statusLabel={status => tStatus(toClaimStatus(status))}
      />
    </div>
  );
}
