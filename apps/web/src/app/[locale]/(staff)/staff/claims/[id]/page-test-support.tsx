import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { buildCommercialHandlingScopeSnapshot } from '@interdomestik/domain-claims/staff-claims/commercial-handling-scope';

const hoisted = vi.hoisted(() => ({
  locale: 'en',
  getInformationRequestsMock: vi.fn(async () => []),
  getSessionMock: vi.fn(async () => ({
    user: {
      id: 'staff-1',
      tenantId: 'tenant-ks',
      role: 'staff',
      branchId: 'branch-a',
    },
  })),
  getStaffClaimDetailMock: vi.fn(async () => ({
    claim: {
      id: 'claim-1',
      claimNumber: 'KS-0001',
      status: 'negotiation',
      staffId: 'staff-1',
      stageLabel: 'Negotiation',
      submittedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
    member: {
      id: 'member-1',
      fullName: 'Member One',
      membershipNumber: 'MEM-001',
    },
    agent: {
      id: 'agent-1',
      name: 'Agent One',
    },
    matterAllowance: {
      allowanceTotal: 2,
      consumedCount: 0,
      remainingCount: 2,
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2026-12-31T23:59:59.000Z',
    },
    recoveryDecision: {
      status: 'pending',
      decidedAt: null,
      explanation: null,
      declineReasonCode: null,
      staffLabel: 'Pending staff decision',
      memberLabel: null,
      memberDescription: null,
    },
    acceptedRecoveryPrerequisites: {
      agreementReady: false,
      canMoveForward: false,
      collectionPathReady: false,
      commercialScope: buildCommercialHandlingScopeSnapshot({
        claimCategory: 'vehicle',
      }),
      isAcceptedRecoveryDecision: false,
    },
    commercialAgreement: null,
    successFeeCollection: null,
  })),
  getPublicStatusHistoryCoreMock: vi.fn(
    async (): Promise<
      Array<{ id: string; note: string | null; toStatus: string | null; createdAt: Date | null }>
    > => []
  ),
  getStaffAssignmentOptionsMock: vi.fn(async () => []),
  getMessagesForClaimCoreMock: vi.fn(async () => ({ success: true, messages: [] })),
  messagingPanelMock: vi.fn(
    ({
      allowInternal,
      claimId,
      currentUser,
      fetchOnMount,
    }: Readonly<{
      allowInternal?: boolean;
      claimId: string;
      currentUser: { role: string };
      fetchOnMount?: boolean;
    }>) => (
      <div
        data-testid="staff-claim-messaging-panel"
        data-allow-internal={String(Boolean(allowInternal))}
        data-claim-id={claimId}
        data-fetch-on-mount={String(fetchOnMount ?? true)}
        data-role={currentUser.role}
      />
    )
  ),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace?: string) => (key: string) => {
    const locale = hoisted.locale;

    if (namespace === 'claims-tracking.status') {
      const statusTranslations: Record<string, Record<string, string>> = {
        en: {
          negotiation: 'Negotiation',
        },
        sq: {
          negotiation: 'Negociim',
        },
      };

      return statusTranslations[locale]?.[key] ?? key;
    }

    const translationsByLocale: Record<string, Record<string, string>> = {
      en: {
        'details.sla_status_label': 'SLA Status',
        'details.sla_phase.running': 'Running',
        'details.sla_phase.incomplete': 'Waiting for member information',
        'details.sla_phase.not_applicable': 'Not active',
        'details.branch_manager_readonly_notice':
          'Branch managers can review claim status and member context here, but assignment, messaging, and claim actions remain staff-only in the pilot.',
        'details.staff_claim.section_title': 'Claim',
        'details.staff_claim.status': 'Status',
        'details.staff_claim.updated': 'Updated',
        'details.staff_claim.submitted': 'Submitted',
        'details.staff_member.section_title': 'Member',
        'details.name': 'Name',
        'details.staff_member.membership_number': 'Membership #',
        'details.staff_matter_allowance.section_title': 'Matter allowance',
        'details.staff_matter_allowance.used_this_year': 'Used this year',
        'details.staff_matter_allowance.remaining_this_year': 'Remaining this year',
        'details.staff_matter_allowance.plan_allowance': 'Plan allowance',
        'details.staff_agent.section_title': 'Agent',
        'details.staff_note.section_title': 'Latest status note',
        'details.staff_note.empty': 'No public status notes yet.',
        'details.messages': 'Messages',
      },
      sq: {
        'details.sla_status_label': 'Statusi i SLA-së',
        'details.sla_phase.running': 'Në rrjedhë',
        'details.sla_phase.incomplete': 'Në pritje të informacionit nga anëtari',
        'details.sla_phase.not_applicable': 'Jo aktiv',
        'details.branch_manager_readonly_notice':
          'Menaxherët e degës mund të rishikojnë statusin e rastit dhe kontekstin e anëtarit këtu, por caktimi, mesazhet dhe veprimet mbi rastin mbeten vetëm për stafin në pilot.',
        'details.staff_claim.section_title': 'Rasti',
        'details.staff_claim.status': 'Statusi',
        'details.staff_claim.updated': 'Përditësuar',
        'details.staff_claim.submitted': 'Dorëzuar',
        'details.staff_member.section_title': 'Anëtari',
        'details.name': 'Emri',
        'details.staff_member.membership_number': 'Nr. anëtarësie',
        'details.staff_matter_allowance.section_title': 'Kuota e rastit',
        'details.staff_matter_allowance.used_this_year': 'Përdorur këtë vit',
        'details.staff_matter_allowance.remaining_this_year': 'Mbetur këtë vit',
        'details.staff_matter_allowance.plan_allowance': 'Kuota e planit',
        'details.staff_agent.section_title': 'Agjenti',
        'details.staff_note.section_title': 'Shënimi i fundit i statusit',
        'details.staff_note.empty': 'Nuk ka ende shënime publike të statusit.',
        'details.messages': 'Mesazhet',
      },
    };

    return translationsByLocale[locale]?.[key] || key;
  }),
  setRequestLocale: vi.fn((locale: string) => {
    hoisted.locale = locale;
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error('notFound');
  },
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionMock,
  requireSessionOrRedirect: (session: unknown) => session,
}));

vi.mock('@interdomestik/domain-claims', () => ({
  getInformationRequests: hoisted.getInformationRequestsMock,
  getStaffClaimDetail: hoisted.getStaffClaimDetailMock,
}));

vi.mock('./_core', () => ({
  getPublicStatusHistoryCore: hoisted.getPublicStatusHistoryCoreMock,
}));

vi.mock('@/features/staff/claims/assignment-options', () => ({
  getStaffAssignmentOptions: hoisted.getStaffAssignmentOptionsMock,
}));

vi.mock('@/actions/messages/get.core', () => ({
  getMessagesForClaimCore: hoisted.getMessagesForClaimCoreMock,
}));

vi.mock('@/components/staff/claim-action-panel', () => ({
  ClaimActionPanel: () => <div data-testid="staff-claim-action-panel" />,
}));

vi.mock('@/components/messaging/messaging-panel', () => ({
  MessagingPanel: (props: unknown) => hoisted.messagingPanelMock(props as never),
}));

import StaffClaimDetailsPage from './page';

export async function renderPage(locale = 'en') {
  render(await StaffClaimDetailsPage({ params: Promise.resolve({ locale, id: 'claim-1' }) }));
}

export { hoisted };
