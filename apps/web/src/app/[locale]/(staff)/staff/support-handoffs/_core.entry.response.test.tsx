import { fireEvent, render, screen } from '@testing-library/react';
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

  it('renders the public response form for the assigned staff owner on accepted handoffs', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        staffId: 'staff-1',
        staffName: 'Staff One',
        status: 'accepted',
      },
    ]);
    mocks.getSupportHandoffDetail.mockResolvedValueOnce({
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
    });

    await renderPage();
    fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));

    expect(await screen.findByTestId('staff-support-handoff-public-response-form')).toBeVisible();
    expect(screen.getByTestId('staff-support-handoff-public-response-input')).toHaveValue(
      'Existing member-visible update'
    );
    expect(screen.getByDisplayValue('3')).toHaveAttribute('name', 'expectedVersion');
    expect(screen.getByTestId('staff-support-handoff-public-response-submit')).toHaveTextContent(
      'detail.public_response_update'
    );
    expect(
      screen.getByTestId('staff-support-handoff-public-response-awaiting-acknowledgement')
    ).toHaveTextContent('detail.public_response_awaiting_acknowledgement');
  });

  it('renders read-only acknowledgement status for the current public response', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        publicResponseAt: '2026-05-04T11:00:00.000Z',
        staffId: 'staff-1',
        staffName: 'Staff One',
        status: 'accepted',
      },
    ]);
    mocks.getSupportHandoffDetail.mockResolvedValueOnce({
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
        publicResponseAcknowledged: true,
        publicResponseAcknowledgedAt: '2026-05-04T11:05:00.000Z',
        publicResponseAcknowledgedVersion: 3,
        publicResponseVersion: 3,
      },
      reassignedAt: null,
      reassignedByName: null,
      reassignReason: null,
      source: 'member_help',
    });

    await renderPage();
    fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));

    expect(
      await screen.findByTestId('staff-support-handoff-public-response-acknowledged')
    ).toHaveTextContent('detail.public_response_acknowledged_at');
  });

  it('shows current-cycle member reply and warns staff before sending another response', async () => {
    mocks.getQueue.mockResolvedValueOnce([
      {
        ...queueItem,
        publicResponseAt: '2026-05-04T11:00:00.000Z',
        staffId: 'staff-1',
        staffName: 'Staff One',
        status: 'accepted',
      },
    ]);
    mocks.getSupportHandoffDetail.mockResolvedValueOnce({
      acceptedAt: '2026-05-04T08:30:00.000Z',
      acceptedByName: 'Staff One',
      closedAt: null,
      closedByName: null,
      closeReason: null,
      contactPreference: 'phone',
      memberReply: {
        memberReply: 'This resolves my request.',
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
    });

    await renderPage();
    fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));

    expect(await screen.findByTestId('handoff-member-reply')).toHaveTextContent(
      'This resolves my request.'
    );
    expect(screen.getByTestId('handoff-member-reply')).toHaveTextContent('detail.member_reply_at');
    expect(screen.getByTestId('staff-support-handoff-member-reply-warning')).toHaveTextContent(
      'detail.member_reply_warning'
    );
  });
});
