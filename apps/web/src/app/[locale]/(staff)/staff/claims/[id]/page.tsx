import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { ClaimMessageSummary } from '@/features/claims/communication/claim-message-summary';
import { BranchManagerStatusHistory } from '@/features/claims/communication/branch-manager-status-history';
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
import { StaffClaimDocumentsSection } from './staff-claim-documents-section';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { getMessagesForClaimCore } from '@/actions/messages/get.core';
import { getStaffAssignmentOptions } from '@/features/staff/claims/assignment-options';
import { authorizeStaffClaimPage } from '@/features/staff/claims/server/authorize-staff-claim-page';
import { getAssignedStaffClaimDocuments } from '@/features/staff/claims/server/get-assigned-claim-documents';
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

export default async function StaffClaimDetailsPage({
  params,
}: Readonly<PageProps>): Promise<React.JSX.Element> {
  const { id, locale } = await params;
  setRequestLocale(locale);
  const tClaims = await getTranslations({ locale, namespace: 'agent-claims.claims' });
  const tStatus = await getTranslations({ locale, namespace: 'claims-tracking.status' });
  const tEvidence = await getTranslations({ locale, namespace: 'claims' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  const session = requireSessionOrRedirect(await getSessionSafe('StaffClaimDetailsPage'), locale);
  if (session.user.role !== 'staff' && session.user.role !== 'branch_manager') {
    return notFound();
  }

  // Bind these readers to the authenticated user's authority, including their exact role/branch.
  const authority = await authorizeStaffClaimPage(session.user);
  if (!authority) return notFound();

  const detail = await getStaffClaimDetail({ claimId: id, authority });

  if (!detail) return notFound();

  const restricted = deniesClaimMessageContent(session.user.role);
  const [statusHistory, assignmentOptions, initialMessagesResult] = await Promise.all([
    restricted ? Promise.resolve([]) : getPublicStatusHistoryCore({ claimId: id, authority }),
    session.user.role === 'staff'
      ? getStaffAssignmentOptions({
          branchId: session.user.branchId ?? null,
          authority,
        })
      : Promise.resolve([]),
    session.user.role === 'staff'
      ? getMessagesForClaimCore({
          session,
          authority,
          claimId: id,
        })
      : Promise.resolve({ success: true as const, messages: [], canAcknowledge: false }),
  ]);

  const currentAssigneeLabel = findAssigneeLabel(assignmentOptions, detail.claim.staffId);
  const initialMessages = readInitialMessages(initialMessagesResult);
  const claimStatus = toClaimStatus(detail.claim.status);
  const slaPhase = deriveClaimSlaPhase(claimStatus);
  const informationRequests = await getInformationRequests(session, authority, id).catch(
    () => null
  );

  const isStaff = session.user.role === 'staff';
  const isAssignedStaff = isStaff && detail.claim.staffId === session.user.id;
  // Failed staff reads remain recoverable failures; do not flatten them into empty conversations.
  const serverReadSucceeded =
    initialMessagesResult.success === true &&
    Array.isArray((initialMessagesResult as { messages?: unknown }).messages);
  const initialReadFailed = isStaff && !serverReadSucceeded;
  // The document reader rechecks exact assignment inside its tenant transaction.
  const assignedDocuments = isAssignedStaff
    ? await getAssignedStaffClaimDocuments({ claimId: id, session, authority }).catch(() => null)
    : null;
  // The information-request card owns real member duties; generic phase copy stays neutral.
  const slaPhaseLabel = isVerificationGuidancePhase(claimStatus, slaPhase)
    ? tClaims('details.verification_guidance')
    : tClaims(`details.sla_phase.${slaPhase}`);

  const sections = buildStaffClaimSections(isStaff, {
    context: tClaims('details.workspace.context'),
    handling: tClaims('details.workspace.handling'),
    history: tClaims('details.workspace.history'),
    messages: tClaims('details.messages'),
    requests: tClaims('details.workspace.requests'),
    documents: isAssignedStaff ? tEvidence('detail.evidence') : undefined,
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
    <div
      className="min-w-0 space-y-6 [&_section]:scroll-mt-80 md:[&_section]:scroll-mt-20"
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

      {/* Commercial explanations and handling payloads are supplied only to staff. */}
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
        {isAssignedStaff && claimStatus === 'verification' && (
          <ClaimInformationRequestForm claimId={id} />
        )}
        <ClaimInformationRequests
          audience="staff"
          canAcknowledge={isAssignedStaff}
          claimId={id}
          requests={informationRequests}
        />
        <StaffClaimDocumentsSection
          documents={assignedDocuments}
          emptyLabel={tEvidence('detail.documentsEmpty')}
          errorLabel={tCommon('errors.generic')}
          isAssignedStaff={isAssignedStaff}
          retryHref={`/${locale}/staff/claims/${encodeURIComponent(id)}`}
          retryLabel={tCommon('tryAgain')}
          title={tEvidence('detail.evidence')}
          viewLabel={tEvidence('informationRequests.download')}
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
              initialCanAcknowledge={initialMessagesResult.canAcknowledge === true}
              initialReadFailed={initialReadFailed}
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

      {restricted ? (
        <>
          <ClaimMessageSummary claimId={id} authority={authority} />
          <BranchManagerStatusHistory claimId={id} authority={authority} />
        </>
      ) : (
        <StaffStatusHistory
          statusHistory={statusHistory}
          locale={locale}
          latestTitle={tClaims('details.staff_note.section_title')}
          emptyLabel={tClaims('details.staff_note.empty')}
          historyTitle={tClaims('details.staff_note.history_title')}
          statusLabel={status => tStatus(toClaimStatus(status))}
        />
      )}
    </div>
  );
}
