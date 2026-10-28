import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  pageMocks as mocks,
  renderPage,
  setupPageMocks,
} from './support-handoff-test-context.fixture';
import { queueItem, session } from './support-handoff-page.fixture';

describe('StaffSupportHandoffsPage', () => {
  beforeEach(setupPageMocks);
  it('hides reassignment for accepted handoffs owned by another staff member', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        staffId: 'staff-2',
        staffName: 'Staff Two',
        status: 'accepted',
      },
    ]);

    await renderPage();

    expect(screen.queryByTestId('staff-support-handoff-reassign-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('staff-support-handoff-close-form')).not.toBeInTheDocument();
  });

  it('renders branch manager access as read-only while keeping branch scope', async () => {
    mocks.getSessionSafe.mockResolvedValue(session('branch_manager'));

    await renderPage();

    expect(screen.getByTestId('staff-support-handoffs-readonly-notice')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoff-readonly')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoff-detail-toggle')).toBeVisible();
    expect(screen.queryByTestId('staff-support-handoff-accept-form')).not.toBeInTheDocument();
    expect(mocks.getQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 'branch-1',
        viewerRole: 'branch_manager',
      })
    );
    expect(mocks.findManyStaff).not.toHaveBeenCalled();
  });

  it('fails closed when staff support queue has no branch scope', async () => {
    mocks.getSessionSafe.mockResolvedValue({
      user: {
        branchId: null,
        id: 'staff-1',
        role: 'staff',
        tenantId: 'tenant-1',
      },
    });
    mocks.findStaffBranch.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('notFound');
    expect(mocks.getQueue).not.toHaveBeenCalled();
  });
});
