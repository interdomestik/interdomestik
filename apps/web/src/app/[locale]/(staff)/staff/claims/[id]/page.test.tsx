import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildCommercialHandlingScopeSnapshot } from '@interdomestik/domain-claims/staff-claims/commercial-handling-scope';

const hoisted = vi.hoisted(() => ({
  locale: 'en',
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
  getLatestPublicStatusNoteCoreMock: vi.fn(async () => null),
  getStaffAssignmentOptionsMock: vi.fn(async () => []),
  getMessagesForClaimCoreMock: vi.fn(async () => ({ success: true, messages: [] })),
  messagingPanelMock: vi.fn(
    ({
      allowInternal,
      claimId,
      currentUser,
      fetchOnMount,
    }: {
      allowInternal?: boolean;
      claimId: string;
      currentUser: { role: string };
      fetchOnMount?: boolean;
    }) => (
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
  notFound: () => {
    throw new Error('notFound');
  },
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionMock,
  requireSessionOrRedirect: (session: unknown) => session,
}));

vi.mock('@interdomestik/domain-claims', () => ({
  getStaffClaimDetail: hoisted.getStaffClaimDetailMock,
}));

vi.mock('./_core', () => ({
  getLatestPublicStatusNoteCore: hoisted.getLatestPublicStatusNoteCoreMock,
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

describe('StaffClaimDetailsPage', () => {
  it('localizes section labels on non-English staff claim detail routes', async () => {
    const tree = await StaffClaimDetailsPage({
      params: Promise.resolve({
        locale: 'sq',
        id: 'claim-1',
      }),
    });

    render(tree);

    expect(screen.getAllByText('Negociim')).toHaveLength(2);
    expect(screen.getByText('Rasti')).toBeInTheDocument();
    expect(screen.getByText('Statusi')).toBeInTheDocument();
    expect(screen.getByText('Përditësuar')).toBeInTheDocument();
    expect(screen.getByText('Dorëzuar')).toBeInTheDocument();
    expect(screen.getByText('Anëtari')).toBeInTheDocument();
    expect(screen.getByText('Nr. anëtarësie')).toBeInTheDocument();
    expect(screen.getByText('Kuota e rastit')).toBeInTheDocument();
    expect(screen.getByText('Përdorur këtë vit')).toBeInTheDocument();
    expect(screen.getByText('Mbetur këtë vit')).toBeInTheDocument();
    expect(screen.getByText('Kuota e planit')).toBeInTheDocument();
    expect(screen.getByText('Agjenti')).toBeInTheDocument();
    expect(screen.getByText('Shënimi i fundit i statusit')).toBeInTheDocument();
    expect(screen.getByText('Nuk ka ende shënime publike të statusit.')).toBeInTheDocument();
    expect(screen.getByText('Mesazhet')).toBeInTheDocument();
  });

  it('renders annual matter usage and remaining allowance on the canonical staff claim detail page', async () => {
    const tree = await StaffClaimDetailsPage({
      params: Promise.resolve({
        locale: 'en',
        id: 'claim-1',
      }),
    });

    render(tree);

    expect(screen.getByTestId('staff-claim-detail-ready')).toBeInTheDocument();
    expect(screen.getByText('Matter allowance')).toBeInTheDocument();
    expect(screen.getByText('SLA Status')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Used this year')).toBeInTheDocument();
    expect(screen.getByText('Remaining this year')).toBeInTheDocument();
    expect(screen.getByText('Plan allowance')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getAllByText('2')).toHaveLength(2);
  });

  it('renders claim messaging with internal-note controls on the canonical staff claim detail page', async () => {
    const tree = await StaffClaimDetailsPage({
      params: Promise.resolve({
        locale: 'en',
        id: 'claim-1',
      }),
    });

    render(tree);

    expect(screen.getByTestId('staff-claim-messaging-panel')).toBeInTheDocument();
    expect(hoisted.messagingPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        allowInternal: true,
        fetchOnMount: false,
        currentUser: expect.objectContaining({
          role: 'staff',
        }),
      })
    );
  });

  it('shows a read-only operator notice for branch managers', async () => {
    hoisted.getSessionMock.mockResolvedValueOnce({
      user: {
        id: 'manager-1',
        tenantId: 'tenant-ks',
        role: 'branch_manager',
        branchId: 'branch-a',
      },
    });

    const tree = await StaffClaimDetailsPage({
      params: Promise.resolve({
        locale: 'en',
        id: 'claim-1',
      }),
    });

    render(tree);

    expect(screen.getByTestId('staff-claim-readonly-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-claim-messaging-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('staff-claim-action-panel')).not.toBeInTheDocument();
  });
});
