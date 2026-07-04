import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HELP_NOW_COUNTRY_PACKS, getTripModeDownloadAssets } from './content-packs';
import { getHelpNowCopy } from './copy';
import { TripMode } from './trip-mode';

const hoisted = vi.hoisted(() => ({
  offlineSaveMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({ trackEvent: hoisted.trackEventMock }));
vi.mock('./offline', () => ({ saveTripModePackForOffline: hoisted.offlineSaveMock }));

function renderTripMode() {
  render(<TripMode copy={getHelpNowCopy('en')} country="XK" packs={HELP_NOW_COUNTRY_PACKS} />);
  return screen.getByTestId('help-now-trip-download');
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
});
