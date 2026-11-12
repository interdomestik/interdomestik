import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OptOutForm } from './opt-out-form';

const fetchMock = vi.fn();
describe('opt-out confirmation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('never requests token status on mount and submits using the keyboard', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<OptOutForm token="token" />);
    expect(fetchMock).not.toHaveBeenCalled();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByText('done')).toHaveFocus());
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/public/sponsor-opt-out',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({ token: 'token' }),
      })
    );
  });

  it('shows a generic invalid link result', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ ok: false }) });
    render(<OptOutForm token="token" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('invalid')).toHaveFocus());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('allows retry after a network error and prevents duplicate submissions while pending', async () => {
    let resolve: (response: unknown) => void = () => undefined;
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    render(<OptOutForm token="token" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('error')).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(screen.getByRole('button')).toBeDisabled();
    fireEvent.click(screen.getByRole('button'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolve({ ok: true, json: async () => ({ ok: true }) });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('done'));
  });
});
