import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimActionPanel } from './claim-action-panel';

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const actionMocks = vi.hoisted(() => ({
  assignClaim: vi.fn().mockResolvedValue({ success: true }),
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

vi.mock('@/actions/staff-claims.core', () => ({
  assignClaim: actionMocks.assignClaim,
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
  actionMocks.assignClaim.mockResolvedValue({ success: true });
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

  it('submits a selected staff assignment manually', async () => {
    render(
      <ClaimActionPanel
        assigneeId={null}
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="submitted"
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

  it('keeps manual assignment save disabled when selection matches the current assignee', () => {
    render(
      <ClaimActionPanel
        assigneeId="staff-other"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="submitted"
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
        assigneeId="staff-out"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentAssigneeLabel="Outside Staff"
        currentStatus="submitted"
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
        assigneeId="staff-other"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={savedAgreement}
        currentStatus="submitted"
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
        assigneeId={null}
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="submitted"
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

  it('passes an internal allowance override reason when updating a recovery claim', async () => {
    render(
      <ClaimActionPanel
        assigneeId="staff-me"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={savedAgreement}
        currentStatus="negotiation"
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
});
