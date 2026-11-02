import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDefaultMocks, queueItem } from './_core.entry.test-support';

const mocks = await vi.hoisted(async () => {
  const { createStaffHandoffMocks } = await import('./_core.entry.test-support');
  return createStaffHandoffMocks();
});

vi.mock('@/actions/support-handoffs/lifecycle', () => ({
  acceptSupportHandoff: mocks.acceptSupportHandoff,
  closeSupportHandoff: mocks.closeSupportHandoff,
  reassignSupportHandoff: mocks.reassignSupportHandoff,
}));

vi.mock('@/actions/support-handoffs/detail', () => ({
  getSupportHandoffDetail: mocks.getSupportHandoffDetail,
}));

vi.mock('@/actions/support-handoffs/response', () => ({
  updateSupportHandoffPublicResponse: mocks.updateSupportHandoffPublicResponse,
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: mocks.getSessionSafe,
  requireSessionOrRedirect: mocks.requireSessionOrRedirect,
}));

vi.mock('@/i18n/routing', async () => (await import('./_core.entry.test-support')).routingMock);

vi.mock('@interdomestik/database', async () =>
  (await import('./_core.entry.test-support')).createDatabaseMock(mocks)
);

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((_tenantId, _column, condition) => ({ condition, scoped: true })),
}));

vi.mock('@interdomestik/domain-claims/support-handoffs/queue', () => ({
  getStaffSupportHandoffQueue: mocks.getQueue,
}));

vi.mock('@interdomestik/ui', async () => (await import('./_core.entry.test-support')).uiMock);

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: mocks.setRequestLocale,
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  useRouter: () => ({
    refresh: mocks.routerRefresh,
  }),
}));

import StaffSupportHandoffsPage from './_core.entry';

async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  const tree = await StaffSupportHandoffsPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  });
  render(tree);
}

describe('StaffSupportHandoffsPage', () => {
  beforeEach(() => {
    applyDefaultMocks(mocks);
  });

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
