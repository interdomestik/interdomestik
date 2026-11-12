import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mocks, renderPage } from './_core.entry.shared.test-support';
import { applyDefaultMocks } from './_core.entry.test-support';

describe('handoff detail recovery', () => {
  it('ignores an older rejected read after a newer detail succeeds', async () => {
    let rejectFirst: (error: Error) => void = () => undefined;
    const first = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject;
    });
    mocks.getSupportHandoffDetail.mockImplementationOnce(() => first);
    await renderPage();
    const toggle = screen.getByTestId('staff-support-handoff-detail-toggle');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(await screen.findByTestId('staff-support-handoff-full-message')).toBeVisible();
    await act(async () => rejectFirst(new Error('old request failed')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('staff-support-handoff-full-message')).toBeVisible();
  });

  beforeEach(() => applyDefaultMocks(mocks));

  it.each(['rejected', 'unavailable'])(
    'keeps the queue and retries a %s detail read',
    async failure => {
      if (failure === 'rejected')
        mocks.getSupportHandoffDetail.mockRejectedValueOnce(new Error('network'));
      else mocks.getSupportHandoffDetail.mockResolvedValueOnce(null);
      await renderPage();
      fireEvent.click(screen.getByTestId('staff-support-handoff-detail-toggle'));
      expect(await screen.findByRole('alert')).toHaveTextContent('detail.unavailable');
      expect(screen.getByTestId('staff-support-handoffs-queue')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(screen.getByTestId('staff-support-handoff-full-message')).toBeVisible();
      expect(mocks.getSupportHandoffDetail).toHaveBeenCalledTimes(2);
    }
  );
});
