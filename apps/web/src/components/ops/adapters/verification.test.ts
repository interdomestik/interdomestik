import { describe, expect, it, vi } from 'vitest';
import { getVerificationActions } from './verification';

describe('getVerificationActions Policy', () => {
  const mockHandlers = {
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onNeedsInfo: vi.fn(),
  };

  const labels = {
    approve: 'Approve',
    reject: 'Reject',
    needsInfo: 'Needs Info',
  };

  it('should return null for terminal statuses', () => {
    expect(
      getVerificationActions({
        status: 'succeeded',
        ...mockHandlers,
        labels,
      })
    ).toBeNull();

    expect(
      getVerificationActions({
        status: 'rejected',
        ...mockHandlers,
        labels,
      })
    ).toBeNull();
  });

  it('should return actions for pending status', () => {
    const actions = getVerificationActions({
      status: 'pending',
      ...mockHandlers,
      labels,
    });

    expect(actions).not.toBeNull();
    expect(actions?.primary.id).toBe('approve');
    expect(actions?.secondary).toHaveLength(2);
    expect(actions?.secondary.map(a => a.id)).toContain('reject');
    expect(actions?.secondary.map(a => a.id)).toContain('needs_info');
  });

  it('should return actions for needs_info status', () => {
    const actions = getVerificationActions({
      status: 'needs_info',
      ...mockHandlers,
      labels,
    });

    expect(actions).not.toBeNull();
    // Even if needs_info, we can still approve or reject, or request info again
    expect(actions?.primary.id).toBe('approve');
  });
});
