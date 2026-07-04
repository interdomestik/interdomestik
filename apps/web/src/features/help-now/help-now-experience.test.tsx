import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpNowExperience } from './help-now-experience';

const hoisted = vi.hoisted(() => ({
  offlineSaveMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({ trackEvent: hoisted.trackEventMock }));
vi.mock('./offline', () => ({ saveTripModePackForOffline: hoisted.offlineSaveMock }));

describe('HelpNowExperience', () => {
  beforeEach(() => {
    hoisted.offlineSaveMock.mockReset();
    hoisted.offlineSaveMock.mockResolvedValue('unsupported');
    hoisted.trackEventMock.mockClear();
    localStorage.clear();
  });

  it('renders public no-account controls and dark country-pack status', () => {
    render(<HelpNowExperience locale="en" />);

    expect(screen.getByTestId('help-now-page-ready')).toHaveAttribute(
      'data-scope',
      'public-no-account'
    );
    expect(screen.getAllByText('Country pack awaiting L2 sign-off')).toHaveLength(2);
    expect(screen.getByText('Signed packs: 0')).toBeInTheDocument();
    expect(screen.queryByText(/112|192/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('help-now-generate-pack')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flight: coming soon' })).toBeDisabled();
    expect(screen.getByText(/nothing sent/i)).toBeInTheDocument();
  });

  it('keeps scenario and country explicit for local pack context', async () => {
    const user = userEvent.setup();
    render(<HelpNowExperience locale="mk" />);

    expect(screen.getByLabelText('Trip country')).toHaveValue('MK');
    await user.click(screen.getByRole('button', { name: 'Имотна штета' }));
    expect(screen.getByRole('button', { name: 'Имотна штета' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    expect(screen.queryByText('Zone')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('tracks page open once when the trip country changes', async () => {
    const user = userEvent.setup();
    render(<HelpNowExperience locale="en" />);

    expect(hoisted.trackEventMock).toHaveBeenCalledTimes(1);
    expect(hoisted.trackEventMock).toHaveBeenCalledWith('help_now_opened', {
      country: 'XK',
      offline: false,
    });

    await user.selectOptions(screen.getByLabelText('Trip country'), 'AL');
    expect(screen.getByLabelText('Trip country')).toHaveValue('AL');
    expect(hoisted.trackEventMock).toHaveBeenCalledTimes(1);
  });

  it('keeps evidence local and allows clearing the bundle', async () => {
    const user = userEvent.setup();
    render(<HelpNowExperience locale="en" />);

    const file = new File(['local'], 'scene.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByTestId('help-now-shot-0'), file);

    expect(screen.getByText(/scene.jpg/)).toBeInTheDocument();
    expect(localStorage.getItem('interdomestik.helpNow.evidenceBundle.v1')).toContain('scene.jpg');

    await user.click(screen.getByTestId('help-now-clear-bundle'));
    expect(localStorage.getItem('interdomestik.helpNow.evidenceBundle.v1')).toBeNull();
  });

  it('keeps evidence UI responsive when storage writes fail', async () => {
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    render(<HelpNowExperience locale="en" />);
    const file = new File(['local'], 'blocked-storage.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByTestId('help-now-shot-0'), file);

    expect(screen.getByText(/blocked-storage.jpg/)).toBeInTheDocument();
    expect(screen.getByTestId('help-now-local-only')).toHaveTextContent('1 items');

    setItemSpy.mockRestore();
  });

  it('keeps evidence UI responsive when storage access is blocked', async () => {
    const user = userEvent.setup();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });

    try {
      render(<HelpNowExperience locale="en" />);
      const file = new File(['local'], 'blocked-access.jpg', { type: 'image/jpeg' });
      await user.upload(screen.getByTestId('help-now-shot-0'), file);

      expect(screen.getByText(/blocked-access.jpg/)).toBeInTheDocument();
      expect(screen.getByTestId('help-now-local-only')).toHaveTextContent('1 items');
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'localStorage', descriptor);
      }
    }
  });

  it('keeps the clear action responsive when storage removal fails', async () => {
    const user = userEvent.setup();
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    render(<HelpNowExperience locale="en" />);
    await user.click(screen.getByTestId('help-now-clear-bundle'));

    expect(screen.getByTestId('help-now-local-only')).toHaveTextContent('0 items');
    removeItemSpy.mockRestore();
  });

  it('distinguishes unsupported and failed Trip Mode offline saves', async () => {
    const user = userEvent.setup();
    render(<HelpNowExperience locale="en" />);
    const downloadButton = screen.getByTestId('help-now-trip-download');

    await user.click(downloadButton);
    expect(await screen.findByText('Offline save is not supported in this browser.')).toHaveClass(
      'text-amber-900'
    );
    await waitFor(() => expect(downloadButton).not.toBeDisabled());

    hoisted.offlineSaveMock.mockResolvedValueOnce('failed');
    await user.click(downloadButton);
    expect(await screen.findByText('Offline save failed. Try again before you travel.')).toHaveClass(
      'text-amber-900'
    );
  });

  it('prevents concurrent Trip Mode save attempts', async () => {
    const user = userEvent.setup();
    let resolveSave: ((value: 'saved') => void) | undefined;
    hoisted.offlineSaveMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSave = resolve;
        })
    );
    render(<HelpNowExperience locale="en" />);

    const button = screen.getByTestId('help-now-trip-download');
    const firstClick = user.click(button);
    const secondClick = user.click(button);
    await Promise.all([firstClick, secondClick]);

    expect(hoisted.offlineSaveMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    resolveSave?.('saved');
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
