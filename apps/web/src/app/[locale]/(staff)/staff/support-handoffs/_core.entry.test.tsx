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
  it('renders the staff receiving queue with optimistic accept controls', async () => {
    await renderPage();

    expect(screen.getByTestId('staff-page-ready')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoffs-queue')).toBeVisible();
    expect(screen.getByText('Help with submitted claim')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoff-accept-form')).toBeVisible();
    expect(screen.getByDisplayValue('4')).toHaveAttribute('name', 'expectedVersion');
    expect(screen.queryByTestId('staff-support-handoff-readonly')).not.toBeInTheDocument();
  });

  it('loads and renders detail context on demand for staff', async () => {
    await renderPage();

    fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));

    await waitFor(() => {
      expect(mocks.getSupportHandoffDetail).toHaveBeenCalledWith('handoff-1');
    });
    expect(await screen.findByTestId('staff-support-handoff-detail-panel')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoff-contact-preference')).toHaveTextContent(
      'detail.contact_preference_phone'
    );
    expect(screen.getByTestId('staff-support-handoff-source')).toHaveTextContent(
      'detail.source_member_help'
    );
    expect(screen.getByTestId('staff-support-handoff-full-message')).toHaveTextContent(
      'The member needs staff support.'
    );
    expect(screen.getByTestId('staff-support-handoff-lifecycle-created')).toHaveTextContent(
      'detail.lifecycle_created'
    );
  });

  it('renders claim-detail source labels in the expanded detail panel', async () => {
    mocks.getSupportHandoffDetail.mockResolvedValueOnce({
      acceptedAt: null,
      acceptedByName: null,
      closedAt: null,
      closedByName: null,
      closeReason: null,
      contactPreference: 'staff_reply',
      memberReply: {
        memberReply: null,
        memberReplyAt: null,
        memberReplyResponseVersion: null,
      },
      publicResponse: {
        publicResponse: null,
        publicResponseAt: null,
        publicResponseVersion: 0,
      },
      reassignedAt: null,
      reassignedByName: null,
      reassignReason: null,
      source: 'member_claim_detail',
    });

    await renderPage();

    fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));

    expect(await screen.findByTestId('staff-support-handoff-source')).toHaveTextContent(
      'detail.source_claim_detail'
    );
  });

  it('shows reassignment only for accepted handoffs owned by the current staff member', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        staffId: 'staff-1',
        staffName: 'Staff One',
        status: 'accepted',
      },
    ]);

    await renderPage();

    expect(screen.getByTestId('staff-support-handoff-reassign-form')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoff-close-form')).toBeVisible();
  });

  it('shows a public response badge when a member-visible update exists', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        publicResponseAt: '2026-05-04T11:00:00.000Z',
      },
    ]);

    await renderPage();

    expect(screen.getByTestId('staff-support-handoff-public-response-badge')).toHaveTextContent(
      'table.public_response_sent'
    );
  });

  it('passes the needs-follow-up attention filter into the staff queue', async () => {
    await renderPage({ attention: 'needs_follow_up' });

    expect(mocks.getQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        attention: 'needs_follow_up',
        status: 'accepted',
      })
    );
    expect(screen.getByTestId('staff-support-handoffs-attention-filters')).toHaveTextContent(
      'filters.attention.needs_follow_up'
    );
    expect(screen.getByText('filters.attention.needs_follow_up')).toHaveAttribute(
      'href',
      '/staff/support-handoffs?attention=needs_follow_up&status=accepted'
    );
  });

  it('clamps needs-follow-up attention to accepted status even with conflicting params', async () => {
    await renderPage({ attention: 'needs_follow_up', status: 'closed' });

    expect(mocks.getQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        attention: 'needs_follow_up',
        status: 'accepted',
      })
    );
    expect(screen.getByText('status.accepted')).toHaveAttribute(
      'href',
      '/staff/support-handoffs?attention=needs_follow_up&status=accepted'
    );
    expect(screen.queryByText('status.closed')).not.toBeInTheDocument();
  });

  it('shows a staff follow-up attention badge for current-cycle member replies', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        needsFollowUp: true,
        publicResponseAt: '2026-05-04T11:00:00.000Z',
      },
    ]);

    await renderPage();

    expect(screen.getByTestId('staff-support-handoff-needs-follow-up-badge')).toHaveTextContent(
      'table.needs_follow_up'
    );
  });
});
