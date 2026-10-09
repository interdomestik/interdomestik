import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installOpsBrowserGlobals } from './ops-browser.test-fixture';
import en from '@/messages/en/admin-claims.json';
import { OpsStatusUpdateModal } from './OpsStatusUpdateModal';

// The global setup mocks next-intl; this file uses the real English catalog.
vi.unmock('next-intl');

const mocks = vi.hoisted(() => ({
  updateStatus: vi.fn(),
  reload: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../../actions/ops-actions', () => ({ updateStatus: mocks.updateStatus }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));

const SERVER_TEXT = 'Server says: Saved. Reload the page if the latest state is not shown.';
const MESSAGES = {
  ...en,
  claims: { status: { verification: 'Verification', negotiation: 'Negotiation' } },
  common: { errors: { generic: 'Something went wrong' } },
};

function renderModal() {
  const props = { onOpenChange: vi.fn(), onCommittedRefreshPending: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={MESSAGES} onError={() => undefined}>
      <OpsStatusUpdateModal
        claimId="claim-123"
        isOpen
        onOpenChange={props.onOpenChange}
        allowedTransitions={['verification', 'negotiation']}
        locale="en"
        onCommittedRefreshPending={props.onCommittedRefreshPending}
      />
    </NextIntlClientProvider>
  );
  return props;
}

async function confirmNegotiation() {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: 'Negotiation' }));
  await user.click(screen.getByRole('button', { name: 'Confirm Update' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  installOpsBrowserGlobals(mocks.reload);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpsStatusUpdateModal committed-write refresh-pending outcome', () => {
  it('closes and forwards a committed outcome without a toast or reload', async () => {
    mocks.updateStatus.mockResolvedValue({
      success: true,
      message: SERVER_TEXT,
      refreshPending: true,
    });
    const props = renderModal();

    await confirmNegotiation();

    await waitFor(() => expect(props.onCommittedRefreshPending).toHaveBeenCalledTimes(1));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onOpenChange.mock.invocationCallOrder[0]).toBeLessThan(
      props.onCommittedRefreshPending.mock.invocationCallOrder[0]
    );
    expect(mocks.updateStatus).toHaveBeenCalledTimes(1);
    expect(mocks.updateStatus).toHaveBeenCalledWith('claim-123', 'negotiation', 'en');
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it.each([
    ['a plain success', { success: true }],
    [
      'a success carrying the compatibility message but no marker',
      { success: true, message: 'Saved. Reload the page if the latest state is not shown.' },
    ],
  ])('keeps the ordinary toast, reload and close for %s', async (_label, result) => {
    mocks.updateStatus.mockResolvedValue(result);
    const props = renderModal();

    await confirmNegotiation();

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Status updated successfully');
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onCommittedRefreshPending).not.toHaveBeenCalled();
  });

  it('keeps a failure a failure without forwarding, reloading or closing', async () => {
    mocks.updateStatus.mockResolvedValue({
      success: false,
      error: 'Illegal transition from evaluation to negotiation',
    });
    const props = renderModal();

    await confirmNegotiation();

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Illegal transition from evaluation to negotiation'
      )
    );
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(props.onCommittedRefreshPending).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('reports an unexpected rejection generically without forwarding', async () => {
    mocks.updateStatus.mockRejectedValue(new Error('network'));
    const props = renderModal();

    await confirmNegotiation();

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Something went wrong'));
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(props.onCommittedRefreshPending).not.toHaveBeenCalled();
  });
});
