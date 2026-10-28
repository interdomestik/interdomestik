import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  pageMocks as mocks,
  renderPage,
  setupPageMocks,
} from './support-handoff-test-context.fixture';
import { queueItem } from './support-handoff-page.fixture';

describe('StaffSupportHandoffsPage', () => {
  beforeEach(setupPageMocks);
  it('refreshes public response detail after the assigned staff owner submits an update', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        staffId: 'staff-1',
        staffName: 'Staff One',
        status: 'accepted',
      },
    ]);
    mocks.getSupportHandoffDetail
      .mockResolvedValueOnce({
        acceptedAt: '2026-05-04T08:30:00.000Z',
        acceptedByName: 'Staff One',
        closedAt: null,
        closedByName: null,
        closeReason: null,
        contactPreference: 'phone',
        memberReply: {
          memberReply: null,
          memberReplyAt: null,
          memberReplyResponseVersion: null,
        },
        publicResponse: {
          publicResponse: 'Existing member-visible update',
          publicResponseAt: '2026-05-04T11:00:00.000Z',
          publicResponseVersion: 3,
        },
        reassignedAt: null,
        reassignedByName: null,
        reassignReason: null,
        source: 'member_help',
      })
      .mockResolvedValueOnce({
        acceptedAt: '2026-05-04T08:30:00.000Z',
        acceptedByName: 'Staff One',
        closedAt: null,
        closedByName: null,
        closeReason: null,
        contactPreference: 'phone',
        memberReply: {
          memberReply: null,
          memberReplyAt: null,
          memberReplyResponseVersion: null,
        },
        publicResponse: {
          publicResponse: 'Updated member-visible response',
          publicResponseAt: '2026-05-04T12:00:00.000Z',
          publicResponseVersion: 4,
        },
        reassignedAt: null,
        reassignedByName: null,
        reassignReason: null,
        source: 'member_help',
      });

    await renderPage();
    fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));

    const input = await screen.findByTestId('staff-support-handoff-public-response-input');
    mocks.routerRefresh.mockClear();
    fireEvent.change(input, { target: { value: 'Updated member-visible response' } });
    fireEvent.submit(screen.getByTestId('staff-support-handoff-public-response-form'));

    await waitFor(() => {
      expect(mocks.updateSupportHandoffPublicResponse).toHaveBeenCalled();
      expect(mocks.getSupportHandoffDetail).toHaveBeenCalledTimes(2);
      expect(mocks.routerRefresh).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('staff-support-handoff-public-response-input')).toHaveValue(
      'Updated member-visible response'
    );
    const refreshedForm = screen.getByTestId('staff-support-handoff-public-response-form');
    expect(refreshedForm.querySelector('input[name="expectedVersion"]')).toHaveValue('4');
  });

  it('removes resolved rows from the needs-follow-up attention queue after staff response', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        needsFollowUp: true,
        publicResponseAt: '2026-05-04T11:00:00.000Z',
        staffId: 'staff-1',
        staffName: 'Staff One',
        status: 'accepted',
      },
    ]);
    mocks.getSupportHandoffDetail
      .mockResolvedValueOnce({
        acceptedAt: '2026-05-04T08:30:00.000Z',
        acceptedByName: 'Staff One',
        closedAt: null,
        closedByName: null,
        closeReason: null,
        contactPreference: 'phone',
        memberReply: {
          memberReply: 'Member reply awaiting staff.',
          memberReplyAt: '2026-05-04T11:10:00.000Z',
          memberReplyResponseVersion: 3,
        },
        publicResponse: {
          publicResponse: 'Existing member-visible update',
          publicResponseAt: '2026-05-04T11:00:00.000Z',
          publicResponseAcknowledged: true,
          publicResponseAcknowledgedAt: '2026-05-04T11:05:00.000Z',
          publicResponseAcknowledgedVersion: 3,
          publicResponseVersion: 3,
        },
        reassignedAt: null,
        reassignedByName: null,
        reassignReason: null,
        source: 'member_help',
      })
      .mockResolvedValueOnce({
        acceptedAt: '2026-05-04T08:30:00.000Z',
        acceptedByName: 'Staff One',
        closedAt: null,
        closedByName: null,
        closeReason: null,
        contactPreference: 'phone',
        memberReply: {
          memberReply: 'Member reply awaiting staff.',
          memberReplyAt: '2026-05-04T11:10:00.000Z',
          memberReplyResponseVersion: 3,
        },
        publicResponse: {
          publicResponse: 'Updated member-visible response',
          publicResponseAt: '2026-05-04T12:00:00.000Z',
          publicResponseAcknowledged: false,
          publicResponseAcknowledgedAt: null,
          publicResponseAcknowledgedVersion: null,
          publicResponseVersion: 4,
        },
        reassignedAt: null,
        reassignedByName: null,
        reassignReason: null,
        source: 'member_help',
      });

    await renderPage({ attention: 'needs_follow_up' });
    fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));

    const input = await screen.findByTestId('staff-support-handoff-public-response-input');
    fireEvent.change(input, { target: { value: 'Updated member-visible response' } });
    fireEvent.submit(screen.getByTestId('staff-support-handoff-public-response-form'));

    await waitFor(() => {
      expect(mocks.updateSupportHandoffPublicResponse).toHaveBeenCalled();
      expect(screen.queryByTestId('staff-support-handoffs-row')).not.toBeInTheDocument();
    });
  });
});
