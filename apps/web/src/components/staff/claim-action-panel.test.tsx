import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCommercialHandlingScopeSnapshot } from '@interdomestik/domain-claims/staff-claims/commercial-handling-scope';
import enAgentClaims from '@/messages/en/agent-claims.json';
import enClaimsTracking from '@/messages/en/claims-tracking.json';
import sqAgentClaims from '@/messages/sq/agent-claims.json';
import sqClaimsTracking from '@/messages/sq/claims-tracking.json';
import { ClaimActionPanel } from './claim-action-panel';

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const actionMocks = vi.hoisted(() => ({
  locale: 'en',
  assignClaim: vi.fn().mockResolvedValue({ success: true }),
  saveRecoveryDecision: vi.fn().mockResolvedValue({ success: true }),
  saveClaimEscalationAgreement: vi.fn().mockResolvedValue({ success: true }),
  saveSuccessFeeCollection: vi.fn().mockResolvedValue({ success: true }),
  updateClaimStatus: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: routerMocks.refresh,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    return (key: string, values?: Record<string, string | number>) => {
      const locale = actionMocks.locale;
      const messageCatalog =
        locale === 'sq'
          ? {
              'agent-claims': sqAgentClaims['agent-claims'],
              'claims-tracking': sqClaimsTracking['claims-tracking'],
            }
          : {
              'agent-claims': enAgentClaims['agent-claims'],
              'claims-tracking': enClaimsTracking['claims-tracking'],
            };

      const path = [...(namespace ? namespace.split('.') : []), ...key.split('.')];
      const template = resolveMessage(messageCatalog, path) ?? key;

      if (!values) return template;
      return Object.entries(values).reduce(
        (result, [name, value]) => result.replace(`{${name}}`, String(value)),
        template
      );
    };
  },
}));

function resolveMessage(source: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = source;

  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' ? current : undefined;
}

vi.mock('@/actions/staff-claims.core', () => ({
  assignClaim: actionMocks.assignClaim,
  saveRecoveryDecision: actionMocks.saveRecoveryDecision,
  saveClaimEscalationAgreement: actionMocks.saveClaimEscalationAgreement,
  saveSuccessFeeCollection: actionMocks.saveSuccessFeeCollection,
  updateClaimStatus: actionMocks.updateClaimStatus,
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  actionMocks.locale = 'en';
  actionMocks.assignClaim.mockResolvedValue({ success: true });
  actionMocks.saveRecoveryDecision.mockResolvedValue({ success: true });
  actionMocks.saveClaimEscalationAgreement.mockResolvedValue({ success: true });
  actionMocks.saveSuccessFeeCollection.mockResolvedValue({ success: true });
  actionMocks.updateClaimStatus.mockResolvedValue({ success: true });
});

describe('ClaimActionPanel', () => {
  const assignmentOptions = [
    { id: 'staff-me', label: 'Drita Gashi' },
    { id: 'staff-other', label: 'Agim Ramadani' },
  ] as const;
  const savedAgreement = {
    acceptedAt: '2026-03-12T00:00:00.000Z',
    claimId: 'claim-1',
    decisionNextStatus: 'negotiation' as const,
    decisionReason: 'Member accepted negotiation as the next recovery path.',
    feePercentage: 25,
    legalActionCapPercentage: 40,
    minimumFee: '25.00',
    paymentAuthorizationState: 'authorized' as const,
    signedAt: '2026-03-12T00:00:00.000Z',
    termsVersion: 'v1',
  };
  const pendingRecoveryDecision = {
    status: 'pending' as const,
    decidedAt: null,
    explanation: null,
    declineReasonCode: null,
    staffLabel: 'Pending staff decision',
    memberLabel: null,
    memberDescription: null,
  };
  const acceptedRecoveryDecision = {
    ...pendingRecoveryDecision,
    status: 'accepted' as const,
    explanation: 'Clear insurer path and viable monetary recovery.',
    staffLabel: 'Accepted for staff-led recovery',
    memberLabel: 'Accepted for staff-led recovery',
    memberDescription: 'We accepted this matter for staff-led recovery.',
  };
  const eligibleCommercialScope = buildCommercialHandlingScopeSnapshot({
    claimCategory: 'vehicle',
  });
  const pendingAcceptedRecoveryPrerequisites = {
    agreementReady: false,
    canMoveForward: false,
    collectionPathReady: false,
    commercialScope: eligibleCommercialScope,
    isAcceptedRecoveryDecision: false,
  };
  const readyAcceptedRecoveryPrerequisites = {
    agreementReady: true,
    canMoveForward: true,
    collectionPathReady: true,
    commercialScope: eligibleCommercialScope,
    isAcceptedRecoveryDecision: true,
  };
  const missingCollectionAcceptedRecoveryPrerequisites = {
    agreementReady: true,
    canMoveForward: false,
    collectionPathReady: false,
    commercialScope: eligibleCommercialScope,
    isAcceptedRecoveryDecision: true,
  };
  const blockedCommercialScopeAcceptedRecoveryPrerequisites = {
    agreementReady: true,
    canMoveForward: false,
    collectionPathReady: false,
    commercialScope: buildCommercialHandlingScopeSnapshot({
      claimCategory: 'travel',
    }),
    isAcceptedRecoveryDecision: true,
  };
  const invoiceFallbackSuccessFeeCollection = {
    claimId: 'claim-1',
    collectionMethod: 'invoice' as const,
    currencyCode: 'EUR',
    deductionAllowed: false,
    feeAmount: '50.00',
    hasStoredPaymentMethod: false,
    invoiceDueAt: '2026-03-20T00:00:00.000Z',
    paymentAuthorizationState: 'authorized' as const,
    recoveredAmount: '200.00',
    resolvedAt: null,
    subscriptionId: null,
  };

  function renderPanel(overrides: Partial<React.ComponentProps<typeof ClaimActionPanel>> = {}) {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={pendingAcceptedRecoveryPrerequisites}
        assigneeId={null}
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="submitted"
        recoveryDecision={pendingRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
        {...overrides}
      />
    );
  }

  it('submits a selected staff assignment manually', async () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={pendingAcceptedRecoveryPrerequisites}
        assigneeId={null}
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="submitted"
        recoveryDecision={pendingRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    fireEvent.change(screen.getByTestId('staff-assignment-select'), {
      target: { value: 'staff-other' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }));

    await waitFor(() => {
      expect(actionMocks.assignClaim).toHaveBeenCalledWith('claim-1', 'staff-other');
    });
  });

  it('localizes visible action-panel copy on non-English routes', () => {
    actionMocks.locale = 'sq';

    renderPanel();

    expect(screen.getByText('Veprimet e stafit')).toBeInTheDocument();
    expect(screen.getByText('Caktimi')).toBeInTheDocument();
    expect(screen.getByLabelText('Cakto rastin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ruaj caktimin' })).toBeInTheDocument();
    expect(screen.getByText('Vendimi i rikuperimit')).toBeInTheDocument();
    expect(screen.getByText('Prano çështjen e rikuperimit')).toBeInTheDocument();
    expect(screen.getByLabelText(/Shpjegimi i vendimit/)).toBeInTheDocument();
  });

  it('renders commercial timestamps in deterministic UTC text', () => {
    renderPanel({
      acceptedRecoveryPrerequisites: readyAcceptedRecoveryPrerequisites,
      commercialAgreement: savedAgreement,
      recoveryDecision: acceptedRecoveryDecision,
      successFeeCollection: invoiceFallbackSuccessFeeCollection,
    });

    expect(screen.getByText('12/03/2026, 00:00 UTC')).toBeInTheDocument();
    expect(screen.getByText('20/03/2026, 00:00 UTC')).toBeInTheDocument();
  });

  it('keeps manual assignment save disabled when selection matches the current assignee', () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={pendingAcceptedRecoveryPrerequisites}
        assigneeId="staff-other"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="submitted"
        recoveryDecision={pendingRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    expect(screen.getByTestId('staff-assignment-select')).toHaveValue('staff-other');
    expect(screen.getByRole('button', { name: 'Save Assignment' })).toBeDisabled();
  });

  it('preserves an out-of-scope current assignee until staff pick a new in-scope option', () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={pendingAcceptedRecoveryPrerequisites}
        assigneeId="staff-out"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentAssigneeLabel="Outside Staff"
        currentStatus="submitted"
        recoveryDecision={pendingRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    expect(screen.getByTestId('staff-assignment-select')).toHaveValue('staff-out');
    expect(screen.getByRole('option', { name: 'Outside Staff (out of scope)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Assignment' })).toBeDisabled();

    fireEvent.change(screen.getByTestId('staff-assignment-select'), {
      target: { value: 'staff-other' },
    });

    expect(screen.getByRole('button', { name: 'Save Assignment' })).toBeEnabled();
  });

  it('keeps success-fee save disabled for non-finite or non-positive recovered amounts', () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={readyAcceptedRecoveryPrerequisites}
        assigneeId="staff-other"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={savedAgreement}
        currentStatus="submitted"
        recoveryDecision={acceptedRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    const recoveredAmountInput = screen.getByLabelText('Recovered amount');
    const saveButton = screen.getByRole('button', { name: 'Save Success-Fee Collection' });

    fireEvent.change(recoveredAmountInput, { target: { value: '1e309' } });
    expect(saveButton).toBeDisabled();

    fireEvent.change(recoveredAmountInput, { target: { value: '0' } });
    expect(saveButton).toBeDisabled();

    fireEvent.change(recoveredAmountInput, { target: { value: '120.50' } });
    expect(saveButton).toBeEnabled();
  });

  it('unlocks success-fee capture immediately after saving a new agreement', async () => {
    actionMocks.saveClaimEscalationAgreement.mockResolvedValueOnce({
      data: savedAgreement,
      success: true,
    });

    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={pendingAcceptedRecoveryPrerequisites}
        assigneeId={null}
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="submitted"
        recoveryDecision={pendingRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    expect(
      screen.getByText('Save the escalation agreement first to unlock success-fee collection.')
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Fee percentage'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Legal-action cap'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Terms version'), { target: { value: 'v1' } });
    fireEvent.change(screen.getByLabelText('Decision reason'), {
      target: { value: 'Member accepted negotiation as the next recovery path.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Escalation Agreement' }));

    await waitFor(() => {
      expect(actionMocks.saveClaimEscalationAgreement).toHaveBeenCalledWith(
        expect.objectContaining({
          claimId: 'claim-1',
          decisionNextStatus: 'negotiation',
          decisionReason: 'Member accepted negotiation as the next recovery path.',
        })
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText('No success-fee collection order has been recorded for this claim.')
      ).toBeInTheDocument();
    });

    const recoveredAmountInput = screen.getByLabelText('Recovered amount');
    const saveButton = screen.getByRole('button', { name: 'Save Success-Fee Collection' });

    await waitFor(() => {
      expect(recoveredAmountInput).toBeEnabled();
    });

    fireEvent.change(recoveredAmountInput, { target: { value: '75.00' } });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
  });

  it('shows accepted recovery prerequisite completeness when the collection path is still missing', () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={missingCollectionAcceptedRecoveryPrerequisites}
        assigneeId="staff-me"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={savedAgreement}
        currentStatus="evaluation"
        recoveryDecision={acceptedRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    expect(screen.getByText('Accepted recovery prerequisites')).toBeInTheDocument();
    expect(screen.getByText('Agreement')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Collection path')).toBeInTheDocument();
    expect(screen.getByText('Missing')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Accepted recovery cannot move into negotiation or court until both prerequisites are ready.'
      )
    ).toBeInTheDocument();
  });

  it('shows the saved collection fallback summary for accepted recovery claims', () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={readyAcceptedRecoveryPrerequisites}
        assigneeId="staff-me"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={savedAgreement}
        currentStatus="evaluation"
        recoveryDecision={acceptedRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={invoiceFallbackSuccessFeeCollection}
      />
    );

    const summary = screen.getByTestId('staff-success-fee-collection-summary');

    expect(summary).toBeInTheDocument();
    expect(within(summary).getByText('EUR 200.00')).toBeInTheDocument();
    expect(within(summary).getByText('Invoice fallback')).toBeInTheDocument();
    expect(within(summary).getByText('No')).toBeInTheDocument();
    expect(within(summary).getByText('2026', { exact: false })).toBeInTheDocument();
  });

  it('shows the launch-scope restriction and keeps commercial actions locked for guidance-only matters', () => {
    renderPanel({
      acceptedRecoveryPrerequisites: blockedCommercialScopeAcceptedRecoveryPrerequisites,
      assigneeId: 'staff-me',
      commercialAgreement: savedAgreement,
      currentStatus: 'evaluation',
      recoveryDecision: acceptedRecoveryDecision,
    });

    expect(screen.getByTestId('staff-commercial-scope-restriction')).toBeInTheDocument();
    expect(screen.getAllByText('Guidance-only or referral-only under current scope')).toHaveLength(
      2
    );
    expect(
      screen.getByText(
        'This matter stays guidance-only or referral-only under the current launch scope.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Escalation Agreement' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Recovered amount'), { target: { value: '120.50' } });
    expect(screen.getByRole('button', { name: 'Save Success-Fee Collection' })).toBeDisabled();
  });

  it('passes an internal allowance override reason when updating a recovery claim', async () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={readyAcceptedRecoveryPrerequisites}
        assigneeId="staff-me"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={savedAgreement}
        currentStatus="negotiation"
        recoveryDecision={acceptedRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    fireEvent.change(screen.getByLabelText(/Status Note/i), {
      target: { value: 'Member asked for a recovery update.' },
    });
    fireEvent.change(screen.getByLabelText(/Allowance override reason/i), {
      target: { value: 'Family upgrade is pending but staff work must start now.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Claim' }));

    await waitFor(() => {
      expect(actionMocks.updateClaimStatus).toHaveBeenCalledWith(
        'claim-1',
        'negotiation',
        'Member asked for a recovery update.',
        true,
        'Family upgrade is pending but staff work must start now.'
      );
    });
  });

  it('shows the staff recovery decision gate before staff-led recovery starts', () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={pendingAcceptedRecoveryPrerequisites}
        assigneeId="staff-me"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="evaluation"
        recoveryDecision={pendingRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    expect(screen.getByText('Pending staff decision')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept Recovery Matter' })).toBeInTheDocument();
  });
});
