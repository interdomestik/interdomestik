import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MembershipOpsPage,
  actionMocks,
  setupMembershipOpsPageHarness,
} from './__tests__/membership-ops-page-harness';

const record = {
  id: 'sub-1',
  status: 'active',
  provider: 'cash',
  planId: 'plan-standard',
  createdAt: '2026-01-01T00:00:00.000Z',
  currentPeriodEnd: '2027-01-01T00:00:00.000Z',
  plan: { name: 'Standard' },
} as never;

describe('MembershipOpsPage cancellation pending state', () => {
  setupMembershipOpsPageHarness();

  it('disables and relabels cancellation until its request settles, then allows it again', async () => {
    actionMocks.getMembershipActions.mockReturnValue({
      primary: undefined,
      secondary: [{ id: 'cancel', label: 'Cancel membership' }],
    });
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
    let settle: (value: { success: boolean; error?: string }) => void = () => {};
    actionMocks.cancelSubscription.mockReturnValueOnce(
      new Promise(resolve => {
        settle = resolve;
      })
    );
    render(<MembershipOpsPage subscriptions={[record]} documents={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel membership' }));
    const pending = await screen.findByRole('button', { name: 'actions.cancel_pending' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(pending);
    expect(actionMocks.cancelSubscription).toHaveBeenCalledTimes(1);

    act(() => settle({ success: false, error: 'failed' }));
    expect(await screen.findByRole('button', { name: 'Cancel membership' })).toBeEnabled();
    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalledWith('errors.action_failed');
  });
});
