import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VerificationDetailsDrawer } from './VerificationDetailsDrawer';

const mocks = vi.hoisted(() => ({
  fetchVerificationDetails: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('./verification-details-fetch', () => ({
  fetchVerificationDetails: mocks.fetchVerificationDetails,
}));
vi.mock('../actions/verification', () => ({ verifyCashAttemptAction: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));
vi.mock('@/components/ops', async () => ({
  ...(await import('@/components/ops/OpsQueryState')),
  OpsActionBar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  OpsDrawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-testid="ops-drawer">{children}</div> : null,
}));

function renderDrawer() {
  render(
    <VerificationDetailsDrawer
      attemptId="qa2-nonexistent"
      isOpen
      onClose={vi.fn()}
      onActionComplete={vi.fn()}
    />
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('VerificationDetailsDrawer load states', () => {
  it('shows a localized not-found state without an error toast for an unknown id', async () => {
    mocks.fetchVerificationDetails.mockResolvedValue({ kind: 'not_found' });
    renderDrawer();

    const empty = await screen.findByTestId('verification-details-not-found');
    expect(empty).toHaveTextContent('admin.leads.drawer.not_found_title');
    expect(empty).toHaveTextContent('admin.leads.drawer.not_found_description');
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.queryByText('Failed to load data')).not.toBeInTheDocument();
  });

  it.each([
    ['reports an error', () => mocks.fetchVerificationDetails.mockResolvedValue({ kind: 'error' })],
    ['rejects', () => mocks.fetchVerificationDetails.mockRejectedValue(new Error('offline'))],
  ])('shows localized error copy and the error toast when loading %s', async (_label, arrange) => {
    arrange();
    renderDrawer();

    expect(await screen.findByText('admin.leads.drawer.load_error')).toBeInTheDocument();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('admin.leads.toasts.error'));
    expect(screen.queryByText('Failed to load data')).not.toBeInTheDocument();
  });

  it('shows a localized loading label while the details load', () => {
    mocks.fetchVerificationDetails.mockReturnValue(new Promise(() => undefined));
    renderDrawer();

    expect(screen.getByText('admin.leads.drawer.loading')).toBeInTheDocument();
    expect(screen.queryByText('Loading details...')).not.toBeInTheDocument();
  });
});
