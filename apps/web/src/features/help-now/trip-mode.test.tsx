import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSignedOffHelpNowPacks, getTripModeDownloadAssets } from './content-packs';
import { getHelpNowCopy } from './copy';
import { TripMode } from './trip-mode';

const hoisted = vi.hoisted(() => ({
  offlineSaveMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({ trackEvent: hoisted.trackEventMock }));
vi.mock('./offline', () => ({ saveTripModePackForOffline: hoisted.offlineSaveMock }));

function renderTripMode() {
  render(<TripMode copy={getHelpNowCopy('en')} country="XK" packs={getSignedOffHelpNowPacks()} />);
  return screen.getByTestId('help-now-trip-download');
}

function renderSignedTripMode() {
  render(<TripMode copy={getHelpNowCopy('en')} country="MK" packs={getSignedOffHelpNowPacks()} />);
}

describe('TripMode', () => {
  beforeEach(() => {
    hoisted.offlineSaveMock.mockReset();
    hoisted.offlineSaveMock.mockResolvedValue('unsupported');
    hoisted.trackEventMock.mockClear();
  });

  it('distinguishes unsupported and failed offline saves in a live status message', async () => {
    const user = userEvent.setup();
    const downloadButton = renderTripMode();

    await user.click(downloadButton);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Offline save is not supported in this browser.'
    );
    expect(screen.getByRole('status')).toHaveClass('text-amber-900');
    await waitFor(() => expect(downloadButton).not.toBeDisabled());

    hoisted.offlineSaveMock.mockResolvedValueOnce('failed');
    await user.click(downloadButton);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Offline save failed. Try again before you travel.'
    );
    expect(screen.getByRole('status')).toHaveClass('text-amber-900');
  });

  it('prevents concurrent save attempts and reports the canonical asset count', async () => {
    const user = userEvent.setup();
    let resolveSave: ((value: 'saved') => void) | undefined;
    hoisted.offlineSaveMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSave = resolve;
        })
    );
    const button = renderTripMode();

    const firstClick = user.click(button);
    const secondClick = user.click(button);
    await Promise.all([firstClick, secondClick]);

    expect(hoisted.offlineSaveMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    resolveSave?.('saved');
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(hoisted.trackEventMock).toHaveBeenCalledWith('trip_pack_downloaded', {
      country: 'XK',
      pack_count: getTripModeDownloadAssets().length,
      total_mb_bucket: 'under_1',
    });
  });

  it('shows signed status for the accepted MK pack only', () => {
    renderSignedTripMode();

    expect(screen.getByText('Country guidance available')).toBeInTheDocument();
    expect(
      screen.queryByText(/Reviewed country packs|reviewer|signed off/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Country guidance not available yet')).not.toBeInTheDocument();
  });

  it('localizes Trip Mode labels while keeping the selected dark country status', () => {
    const copy = getHelpNowCopy('sq');
    render(<TripMode copy={copy} country="XK" packs={getSignedOffHelpNowPacks()} />);

    expect(screen.getByRole('heading', { name: 'Modaliteti i udhëtimit' })).toBeInTheDocument();
    expect(
      screen.getByText('Udhëzimet për këtë vend nuk janë ende të disponueshme')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Paketa vendesh/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trip Mode|Signed packs/)).not.toBeInTheDocument();
  });
});
