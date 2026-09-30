import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateClaimStatus } from '@/actions/staff-claims.core';
import { toast } from 'sonner';
import en from '@/messages/en/agent-claims.json';
import sq from '@/messages/sq/agent-claims.json';
import mk from '@/messages/mk/agent-claims.json';
import sr from '@/messages/sr/agent-claims.json';

import type { TranslateFn } from './format-helpers';
import { useClaimActionPanelHandlers } from './use-claim-action-panel-handlers';
import {
  INITIAL_STATUS,
  StatusUpdateHarness,
  TestErrorBoundary,
  stubRecoveryDecision,
  t,
} from './status-update-test.fixture';

vi.mock('@/actions/staff-claims.core', () => ({
  assignClaim: vi.fn(),
  saveClaimEscalationAgreement: vi.fn(),
  saveRecoveryDecision: vi.fn(),
  saveSuccessFeeCollection: vi.fn(),
  updateClaimStatus: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockedUpdateClaimStatus = vi.mocked(updateClaimStatus);
const mockedToastSuccess = vi.mocked(toast.success);
const mockedToastError = vi.mocked(toast.error);

describe('handleStatusUpdate transport recovery', () => {
  it.each(Object.entries({ en, sq, mk, sr }))(
    'uses the %s recovery catalog without showing transport details',
    async (_locale, catalog) => {
      const messages = catalog['agent-claims'].claims.staff_actions.error;
      const translate: TranslateFn = key =>
        key === 'staff_actions.error.title'
          ? messages.title
          : key === 'staff_actions.error.status_save_unconfirmed'
            ? messages.status_save_unconfirmed
            : key;
      mockedUpdateClaimStatus.mockRejectedValueOnce(new Error('private transport detail'));
      render(
        <TestErrorBoundary>
          <StatusUpdateHarness refresh={vi.fn()} translate={translate} />
        </TestErrorBoundary>
      );
      fireEvent.click(screen.getByRole('button', { name: 'save' }));
      await waitFor(() =>
        expect(mockedToastError).toHaveBeenCalledWith(messages.title, {
          description: messages.status_save_unconfirmed,
        })
      );
      expect(messages.status_save_unconfirmed).not.toBe(
        'staff_actions.error.status_save_unconfirmed'
      );
      expect(screen.getByTestId('note').textContent).toBe('  raw note  ');
    }
  );

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows a localized unconfirmed-save toast and keeps the draft when the action call rejects, without raw error text or an error boundary fallback', async () => {
    mockedUpdateClaimStatus.mockRejectedValueOnce(new Error('network transport failure'));
    const refresh = vi.fn();

    render(
      <TestErrorBoundary>
        <StatusUpdateHarness refresh={refresh} />
      </TestErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith('staff_actions.error.title', {
        description: 'staff_actions.error.status_save_unconfirmed',
      })
    );

    expect(screen.getByTestId('note').textContent).toBe('  raw note  ');
    expect(screen.getByTestId('allowance').textContent).toBe('  raw reason  ');
    expect(refresh).not.toHaveBeenCalled();
    expect(mockedToastSuccess).not.toHaveBeenCalled();
    expect(mockedUpdateClaimStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('status')).toHaveTextContent(INITIAL_STATUS);

    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('idle'));
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull();

    for (const call of mockedToastError.mock.calls) {
      expect(call[1]?.description).not.toBe('network transport failure');
    }
  });

  it('blocks another save until staff explicitly acknowledge checking history', async () => {
    mockedUpdateClaimStatus.mockRejectedValueOnce(new Error('response lost'));
    const refresh = vi.fn();
    render(
      <TestErrorBoundary>
        <StatusUpdateHarness refresh={refresh} />
      </TestErrorBoundary>
    );
    const save = screen.getByRole('button', { name: 'save' });
    fireEvent.click(save);
    await screen.findByRole('button', { name: 'history checked' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mockedUpdateClaimStatus).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId('note')).toHaveTextContent('raw note');
    expect(screen.getByTestId('allowance')).toHaveTextContent('raw reason');
    expect(screen.getByTestId('status')).toHaveTextContent(INITIAL_STATUS);
    fireEvent.click(screen.getByRole('button', { name: 'history checked' }));
    expect(save).toBeEnabled();
    expect(mockedUpdateClaimStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing result.error toast and draft on a known negative result, and sends trimmed values', async () => {
    mockedUpdateClaimStatus.mockResolvedValueOnce({
      success: false,
      error: 'Status conflict, try again',
    });
    const refresh = vi.fn();

    render(
      <TestErrorBoundary>
        <StatusUpdateHarness refresh={refresh} />
      </TestErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith('staff_actions.error.title', {
        description: 'Status conflict, try again',
      })
    );

    expect(mockedUpdateClaimStatus).toHaveBeenCalledWith(
      'claim-1',
      INITIAL_STATUS,
      'raw note',
      true,
      'raw reason'
    );
    expect(screen.getByTestId('note').textContent).toBe('  raw note  ');
    expect(screen.getByTestId('allowance').textContent).toBe('  raw reason  ');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('allows a successful manual retry after a transport rejection, calling the action only once before the retry', async () => {
    mockedUpdateClaimStatus
      .mockRejectedValueOnce(new Error('network transport failure'))
      .mockResolvedValueOnce({ success: true });
    const refresh = vi.fn();

    render(
      <TestErrorBoundary>
        <StatusUpdateHarness refresh={refresh} />
      </TestErrorBoundary>
    );
    const button = screen.getByRole('button', { name: 'save' });

    fireEvent.click(button);
    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith('staff_actions.error.title', {
        description: 'staff_actions.error.status_save_unconfirmed',
      })
    );
    expect(mockedUpdateClaimStatus).toHaveBeenCalledTimes(1);

    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'history checked' }));
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(mockedToastSuccess).toHaveBeenCalledWith('staff_actions.success.title', {
        description: 'staff_actions.success.status_updated',
      })
    );

    expect(mockedUpdateClaimStatus).toHaveBeenCalledTimes(2);
    expect(mockedUpdateClaimStatus).toHaveBeenNthCalledWith(
      2,
      'claim-1',
      INITIAL_STATUS,
      'raw note',
      true,
      'raw reason'
    );
    expect(screen.getByTestId('note').textContent).toBe('');
    expect(screen.getByTestId('allowance').textContent).toBe('');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not report a post-success refresh failure as an unconfirmed save', async () => {
    mockedUpdateClaimStatus.mockResolvedValueOnce({ success: true });
    const refresh = vi.fn(() => {
      throw new Error('refresh failed');
    });

    let capturedCallback: (() => Promise<void>) | undefined;
    const startTransition = (callback: () => void) => {
      capturedCallback = callback as () => Promise<void>;
    };

    const { result } = renderHook(() =>
      useClaimActionPanelHandlers({
        agreementSaveKeyRef: { current: null },
        allowanceOverrideReason: '  raw reason  ',
        assignmentOptions: [],
        claimId: 'claim-1',
        decisionExplanation: '',
        decisionNextStatus: 'negotiation',
        decisionReason: '',
        decisionSaveKeyRef: { current: null },
        declineReasonCode: '',
        deductionPath: 'fallback',
        feePercentage: '',
        hasValidRecoveredAmount: false,
        legalActionCapPercentage: '',
        minimumFee: '',
        note: '  raw note  ',
        parsedRecoveredAmount: 0,
        paymentAuthorizationState: 'pending',
        recoveryDecision: stubRecoveryDecision,
        refresh,
        selectedAssigneeId: '',
        setAllowanceOverrideReason: () => {},
        setDeclineReasonCode: () => {},
        setNote: () => {},
        setSavedAgreement: () => {},
        setSavedRecoveryDecision: () => {},
        setSavedSuccessFeeCollection: () => {},
        setStatus: () => {},
        staffId: 'staff-1',
        startTransition,
        status: INITIAL_STATUS,
        t,
        termsVersion: '',
      })
    );

    result.current.handleStatusUpdate();
    await expect(capturedCallback?.()).rejects.toThrow('refresh failed');

    expect(mockedToastSuccess).toHaveBeenCalledWith('staff_actions.success.title', {
      description: 'staff_actions.success.status_updated',
    });
    expect(mockedToastError).not.toHaveBeenCalled();
  });
});
