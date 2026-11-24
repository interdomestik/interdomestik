import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '@/messages/en/admin-settings.json';
import { PilotSwitchControl, type PilotSwitchControlProps } from './pilot-switch-control';

vi.unmock('next-intl');
const setPilotSwitch = vi.hoisted(() => vi.fn());
vi.mock('@/actions/admin-settings/set-pilot-switch', () => ({ setPilotSwitch }));

const switches: PilotSwitchControlProps['pilotSwitches'] = [
  { key: 'public_intake', state: 'open', revision: 1, wellFormed: true },
  { key: 'new_sales', state: 'closed', revision: 2, wellFormed: true },
];
const copy = messages.admin.settings_page.pilot;
const reason = 'Pause during review';

function renderControl(pilotSwitches: PilotSwitchControlProps['pilotSwitches'] = switches) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PilotSwitchControl pilotSwitches={pilotSwitches} />
    </NextIntlClientProvider>
  );
}

describe('PilotSwitchControl', () => {
  beforeEach(() => vi.resetAllMocks());

  it('announces pending completion and uses the revision returned by the action', async () => {
    const result = {
      success: true,
      data: { state: 'closed', revision: 2, wellFormed: true },
    } as const;
    let complete = () => {};
    setPilotSwitch.mockImplementationOnce(
      () =>
        new Promise<typeof result>(resolve => {
          complete = () => resolve(result);
        })
    );
    renderControl();
    fireEvent.change(screen.getByLabelText(copy.reason), { target: { value: reason } });
    const close = screen.getByRole('button', { name: copy.close_switch });
    fireEvent.click(close);
    expect(close).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(copy.pending);
    expect(setPilotSwitch).toHaveBeenCalledExactlyOnceWith({
      key: 'public_intake',
      enabled: false,
      expectedRevision: 1,
      reason,
    });

    await act(async () => complete());
    expect(screen.getByRole('status')).toHaveTextContent(copy.saved);
    expect(screen.getByRole('button', { name: copy.open_switch })).toBeEnabled();
  });

  it('requires a fresh read after a stale reopening attempt', async () => {
    setPilotSwitch.mockResolvedValueOnce({ success: false, code: 'CONFLICT' });
    renderControl();
    fireEvent.change(screen.getByRole('combobox', { name: copy.switch }), {
      target: { value: 'new_sales' },
    });
    expect(screen.getByLabelText(copy.approval)).toBeRequired();
    fireEvent.change(screen.getByLabelText(copy.approval), { target: { value: 'signed record' } });
    fireEvent.change(screen.getByLabelText(copy.reason), { target: { value: reason } });
    const open = screen.getByRole('button', { name: copy.open_switch });
    fireEvent.click(open);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(copy.conflict));
    expect(setPilotSwitch).toHaveBeenCalledExactlyOnceWith({
      key: 'new_sales',
      enabled: true,
      expectedRevision: 2,
      reason,
      approvalReference: 'signed record',
    });
    expect(open).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.reload })).toBeEnabled();
  });

  it('shows a retry when the switch state could not be read', () => {
    renderControl(null);
    expect(screen.getByRole('alert')).toHaveTextContent(copy.unavailable);
    expect(screen.getByRole('button', { name: copy.reload })).toBeEnabled();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
