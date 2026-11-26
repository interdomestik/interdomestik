import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mocks, renderPage } from './_core.entry.shared.test-support';
import { applyDefaultMocks } from './_core.entry.test-support';

describe('handoff detail recovery', () => {
  beforeEach(() => applyDefaultMocks(mocks));

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
    await act(async () => fireEvent.click(toggle));
    expect(screen.getByTestId('staff-support-handoff-full-message')).toBeVisible();
    await act(async () => rejectFirst(new Error('old request failed')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('staff-support-handoff-full-message')).toBeVisible();
  });

  it.each(['rejected', 'unavailable'])(
    'keeps the queue and retries a %s detail read',
    async failure => {
      if (failure === 'rejected')
        mocks.getSupportHandoffDetail.mockRejectedValueOnce(new Error('network'));
      else mocks.getSupportHandoffDetail.mockResolvedValueOnce(null);
      await renderPage();
      const toggle = screen.getByTestId('staff-support-handoff-detail-toggle');
      await act(async () => fireEvent.click(toggle));
      expect(screen.getByRole('alert')).toHaveTextContent('detail.unavailable');
      expect(screen.getByTestId('staff-support-handoffs-queue')).toBeVisible();
      const retry = screen.getByRole('button', { name: 'Try again' });
      expect(retry).toBeEnabled();
      await act(async () => fireEvent.click(retry));
      expect(screen.getByTestId('staff-support-handoff-full-message')).toBeVisible();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(mocks.getSupportHandoffDetail).toHaveBeenCalledTimes(2);
    }
  );
});
