import { getInformationRequests, getStaffClaimDetail } from '@interdomestik/domain-claims';
import { ClaimInformationRequestForm } from '@/features/staff/claims/components/ClaimInformationRequestForm';
import { ClaimInformationRequests } from '@/features/member/claims/components/ClaimInformationRequests';
import { StaffClaimContext } from '@/features/staff/claims/components/StaffClaimContext';
import { StaffClaimWorkspaceHeader } from '@/features/staff/claims/components/StaffClaimWorkspaceHeader';
import {
  SECTION_CONTEXT,
  SECTION_HANDLING,
  SECTION_HEADING,
  SECTION_MESSAGES,
  SECTION_REQUESTS,
  buildStaffClaimContextGroups,
  buildStaffClaimSections,
  findAssigneeLabel,
  isVerificationGuidancePhase,
  readInitialMessages,
} from '@/features/staff/claims/components/staff-claim-workspace-view';
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

interface PageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

function toClaimStatus(value: unknown): ClaimStatus {
  return CLAIM_STATUSES.includes(value as ClaimStatus) ? (value as ClaimStatus) : 'draft';
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

  const currentAssigneeLabel = findAssigneeLabel(assignmentOptions, detail.claim.staffId);
  const initialMessages = readInitialMessages(initialMessagesResult);
  const claimStatus = toClaimStatus(detail.claim.status);
  const slaPhase = deriveClaimSlaPhase(claimStatus);
  const informationRequests = await getInformationRequests(session, id).catch(() => null);

  const isStaff = session.user.role === 'staff';
  const isAssignedStaff = isStaff && detail.claim.staffId === session.user.id;
  // Phase derivation stays operative; only this route's generic verification copy is neutral so it
  // never implies an outstanding member duty. The request card remains the source of real duties.
  const slaPhaseLabel = isVerificationGuidancePhase(claimStatus, slaPhase)
    ? tClaims('details.verification_guidance')
    : tClaims(`details.sla_phase.${slaPhase}`);

  const sections = buildStaffClaimSections(isStaff, {
    context: tClaims('details.workspace.context'),
    handling: tClaims('details.workspace.handling'),
    history: tClaims('details.workspace.history'),
    messages: tClaims('details.messages'),
    requests: tClaims('details.workspace.requests'),
  });

  const contextGroups = buildStaffClaimContextGroups({
    agent: detail.agent,
    labels: {
      agentTitle: tClaims('details.staff_agent.section_title'),
      agentUnassigned: tClaims('staff_queue.assignment_state.unassigned'),
      allowanceRemaining: tClaims('details.staff_matter_allowance.remaining_this_year'),
      allowanceTitle: tClaims('details.staff_matter_allowance.section_title'),
      allowanceTotal: tClaims('details.staff_matter_allowance.plan_allowance'),
      allowanceUsed: tClaims('details.staff_matter_allowance.used_this_year'),
      claimTitle: tClaims('details.staff_claim.section_title'),
      memberTitle: tClaims('details.staff_member.section_title'),
      membershipField: tClaims('details.staff_member.membership_number'),
      nameField: tClaims('details.name'),
      slaTitle: tClaims('details.sla_status_label'),
      statusField: tClaims('details.staff_claim.status'),
      submittedField: tClaims('details.staff_claim.submitted'),
      updatedField: tClaims('details.staff_claim.updated'),
    },
    locale,
    matterAllowance: detail.matterAllowance,
    memberFullName: detail.member.fullName,
    membershipNumber: detail.member.membershipNumber,
    slaPhase,
    slaPhaseLabel,
    statusValue: tStatus(claimStatus),
    submittedAt: detail.claim.submittedAt,
    updatedAt: detail.claim.updatedAt,
  });

  return (
    // Workspace-scoped scroll margin: every fragment destination inside this route (including
    // the context and history sections owned by their own components) clears the sticky shared
    // header, which is taller when it wraps at 320 CSS px or with enlarged root text.
    <div
      className="space-y-6 [&_section]:scroll-mt-80 md:[&_section]:scroll-mt-20"
      data-testid="staff-claim-detail-ready"
    >
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
