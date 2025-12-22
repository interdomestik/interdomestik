import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TriagePanel } from './triage-panel';

// Mock updateClaimStatus action
vi.mock('@/actions/agent-claims', () => ({
  updateClaimStatus: vi.fn().mockResolvedValue({ success: true }),
}));

import { updateClaimStatus } from '@/actions/agent-claims';
const mockUpdateClaimStatus = vi.mocked(updateClaimStatus);

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Triage Actions',
      changeStatus: 'Change Status',
      selectStatus: 'Select status',
      verify: 'Verify Info',
      reject: 'Reject Claim',
      notice: "Changing status updates the user's timeline immediately.",
      submitted: 'Submitted',
      verification: 'Verification',
      evaluation: 'Evaluation',
      negotiation: 'Negotiation',
      court: 'Court',
      resolved: 'Resolved',
      rejected: 'Rejected',
    };
    return translations[key] || key;
  },
}));

describe('TriagePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the triage panel with title', () => {
    render(<TriagePanel claimId="claim-1" currentStatus="submitted" />);

    expect(screen.getByText('Triage Actions')).toBeInTheDocument();
    expect(screen.getByText('Change Status')).toBeInTheDocument();
  });

  it('renders verify and reject quick action buttons', () => {
    render(<TriagePanel claimId="claim-1" currentStatus="submitted" />);

    expect(screen.getByText('Verify Info')).toBeInTheDocument();
    expect(screen.getByText('Reject Claim')).toBeInTheDocument();
  });

  it('shows notice about status changes', () => {
    render(<TriagePanel claimId="claim-1" currentStatus="submitted" />);

    expect(screen.getByText(/Changing status updates the user's timeline/)).toBeInTheDocument();
  });

  it('disables verify button when status is already verification', () => {
    render(<TriagePanel claimId="claim-1" currentStatus="verification" />);

    const verifyButton = screen.getByText('Verify Info');
    expect(verifyButton).toBeDisabled();
  });

  it('disables reject button when status is already rejected', () => {
    render(<TriagePanel claimId="claim-1" currentStatus="rejected" />);

    const rejectButton = screen.getByText('Reject Claim');
    expect(rejectButton).toBeDisabled();
  });

  it('calls updateClaimStatus when verify button is clicked', async () => {
    render(<TriagePanel claimId="claim-1" currentStatus="submitted" />);

    const verifyButton = screen.getByText('Verify Info');
    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(mockUpdateClaimStatus).toHaveBeenCalledWith('claim-1', 'verification');
    });
  });

  it('calls updateClaimStatus when reject button is clicked', async () => {
    render(<TriagePanel claimId="claim-1" currentStatus="submitted" />);

    const rejectButton = screen.getByText('Reject Claim');
    fireEvent.click(rejectButton);

    await waitFor(() => {
      expect(mockUpdateClaimStatus).toHaveBeenCalledWith('claim-1', 'rejected');
    });
  });

  it('shows status selector', () => {
    render(<TriagePanel claimId="claim-1" currentStatus="submitted" />);

    // Status selector trigger should be present
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
