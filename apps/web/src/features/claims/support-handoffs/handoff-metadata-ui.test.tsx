import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
const mocks = vi.hoisted(() => ({ read: vi.fn(), detail: vi.fn(), refresh: vi.fn() }));
vi.mock('./get-handoff-metadata', () => ({ getHandoffMetadata: mocks.read }));
vi.mock('@/actions/support-handoffs/detail', () => ({ getSupportHandoffDetail: mocks.detail }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: () => Promise.resolve((key: string) => key),
}));
import { BranchManagerHandoffs } from './branch-manager-handoffs';
const props = {
  authority: {} as TenantAuthority,
  params: Promise.resolve({ locale: 'en' }),
  searchParams: Promise.resolve({}),
};
const row = {
  id: 'handoff',
  status: 'accepted',
  urgency: 'normal',
  staffId: null,
  staffName: null,
  branchId: 'branch',
  branchName: 'Branch',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: null,
  acceptedAt: null,
  reassignedAt: null,
  closedAt: null,
  publicResponseAt: null,
  publicResponseCount: 0,
  memberReplyAt: null,
};
beforeEach(() => {
  vi.clearAllMocks();
});
describe('BM handoff presentation and recovery', () => {
  it('marks the toggle container hydrated only after mount', async () => {
    mocks.read.mockResolvedValue({ kind: 'ok', data: [row] });
    const tree = await BranchManagerHandoffs(props);
    expect(renderToString(tree)).toContain('data-hydrated="false"');
    render(tree);
    expect(screen.getByTestId('staff-support-handoff-detail-toggle').parentElement).toHaveAttribute(
      'data-hydrated',
      'true'
    );
    expect(mocks.detail).not.toHaveBeenCalled();
  });
  it.each(['failed', 'unavailable'] as const)(
    'keeps %s explicit with a keyboard refresh',
    async kind => {
      mocks.read.mockResolvedValue({ kind });
      render(await BranchManagerHandoffs(props));
      expect(screen.getByText(kind)).toBeInTheDocument();
      expect(screen.queryByTestId('staff-support-handoffs-empty')).not.toBeInTheDocument();
      const retry = screen.getByRole('button', { name: 'retry' });
      retry.focus();
      await userEvent.setup().keyboard('{Enter}');
      expect(mocks.refresh).toHaveBeenCalledOnce();
      expect(retry).toHaveFocus();
      expect(screen.getByTestId('staff-page-ready')).toBeInTheDocument();
    }
  );
  it('shows a genuine empty queue independently from unavailable or failed reads', async () => {
    mocks.read.mockResolvedValue({ kind: 'ok', data: [] });
    render(await BranchManagerHandoffs(props));
    expect(screen.getByTestId('staff-support-handoffs-empty')).toBeInTheDocument();
    expect(screen.queryByText('unavailable')).not.toBeInTheDocument();
  });
  it('renders metadata and retries failed details without losing keyboard focus', async () => {
    mocks.read.mockResolvedValue({
      kind: 'ok',
      data: [{ ...row, message: 'MESSAGE-SENTINEL', subject: 'SUBJECT-SENTINEL' }],
    });
    mocks.detail
      .mockRejectedValueOnce(new Error('PRIVATE-SENTINEL'))
      .mockResolvedValueOnce({ kind: 'metadata', result: { kind: 'ok', data: [row] } });
    const { container } = render(await BranchManagerHandoffs(props));
    const toggle = screen.getByRole('button', { name: 'detail.expand' });
    toggle.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(await screen.findByText('failed')).toBeInTheDocument();
    expect(toggle).toHaveFocus();
    const retries = screen.getAllByRole('button', { name: 'retry' });
    retries[0].focus();
    await userEvent.setup().keyboard('{Enter}');
    await waitFor(() => expect(screen.getAllByTestId('handoff-metadata-status')).toHaveLength(2));
    expect(retries[0]).toHaveFocus();
    expect(container.textContent).not.toContain('SENTINEL');
    expect(container.querySelector('textarea')).toBeNull();
    expect(screen.getByLabelText('handoffs.search')).toHaveAttribute('name', 'search');
  });
});
