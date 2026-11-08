import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en/sponsors.json';
import { ActionForm } from './action-form';
import { sponsorAction } from './actions';

vi.unmock('next-intl');
vi.mock('./actions', () => ({ sponsorAction: vi.fn() }));
const action = vi.mocked(sponsorAction);

function form(): React.JSX.Element {
  return (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <ActionForm operation="terminateTerm" target={{ sponsorId: 'sponsor', termId: 'term' }}>
        <label>
          Time
          <input name="effectiveAt" defaultValue="2030-06-01T12:00" />
        </label>
      </ActionForm>
    </NextIntlClientProvider>
  );
}

describe('sponsor form feedback', () => {
  it('converts local times, submits the target and announces success', async () => {
    action.mockResolvedValue({ ok: true });
    render(form());
    fireEvent.click(screen.getByRole('button', { name: 'Terminate term' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved.'));
    const data = action.mock.calls[0]?.[2];
    expect(data?.get('effectiveAt')).toBe(new Date('2030-06-01T12:00').toISOString());
    expect(data?.get('sponsorId')).toBe('sponsor');
  });
  it('announces actionable errors and leaves the form available for correction', async () => {
    action.mockResolvedValue({ ok: false, error: 'invalid' });
    render(form());
    fireEvent.click(screen.getByRole('button', { name: 'Terminate term' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Check the fields'));
    expect(screen.getByRole('button', { name: 'Terminate term' })).toBeEnabled();
  });
  it('keeps transport failures in the form with refresh guidance', async () => {
    action.mockRejectedValue(new Error('network unavailable'));
    render(form());
    fireEvent.click(screen.getByRole('button', { name: 'Terminate term' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Refresh to check'));
  });
});
