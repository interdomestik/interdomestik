import { mockAgents, mockUsers, selectCallbacks } from './__tests__/users-table-fixtures';
import { updateUserAgent } from '@/actions/admin-users';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersTable } from './users-table';
import { UsersSections } from './users-sections';

describe('UsersTable unavailable assignment choices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallbacks.length = 0;
  });

  it('rejects a late enabled callback before any writer or optimistic assignment change', async () => {
    const users = [{ ...mockUsers[0], agentId: 'agent-1' }];
    const view = render(<UsersTable users={users} agents={mockAgents} />);
    const lateCallback = selectCallbacks.at(-1)!;
    expect(screen.getByTestId('assignment-select')).toHaveAttribute('data-value', 'agent-1');
    view.rerender(<UsersTable users={users} agents={[]} assignmentChoicesAvailable={false} />);
    expect(screen.getByText('Select Agent').closest('button')).toBeDisabled();
    await act(async () => {
      lateCallback('agent-2');
      selectCallbacks.at(-1)!('company-owned');
    });
    expect(updateUserAgent).not.toHaveBeenCalled();
    expect(screen.getByTestId('assignment-select')).toHaveAttribute('data-value', 'agent-1');
    expect(screen.getByRole('link', { name: 'View Profile' })).toHaveAttribute(
      'href',
      expect.stringContaining('page=2')
    );
    expect(screen.getByRole('link', { name: '3 new message(s)' })).toHaveAttribute(
      'href',
      expect.stringContaining('claim-1')
    );
    view.rerender(<UsersTable users={users} agents={mockAgents} assignmentChoicesAvailable />);
    expect(screen.getByText('Select Agent').closest('button')).not.toBeDisabled();
    expect(screen.getByTestId('assignment-select')).toHaveAttribute('data-value', 'agent-1');
    vi.mocked(updateUserAgent).mockResolvedValueOnce({ success: true });
    await act(async () => {
      await selectCallbacks.at(-1)!('agent-2');
    });
    expect(updateUserAgent).toHaveBeenCalledExactlyOnceWith('user-1', 'agent-2');
  });

  it('keeps successful empty choices available and guards agent member capability in both sections', () => {
    const view = render(<UsersTable users={[mockUsers[0]]} agents={[]} />);
    expect(screen.getByText('Select Agent').closest('button')).not.toBeDisabled();
    view.rerender(
      <UsersSections users={[mockUsers[1]]} agents={[]} assignmentChoicesAvailable={false} />
    );
    for (const trigger of screen.getAllByText('Select Agent'))
      expect(trigger.closest('button')).toBeDisabled();
  });
});
