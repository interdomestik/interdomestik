import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
import { RestrictedCommunicationNotice } from './restricted-communication-notice';

describe('communication notice recovery and keyboard focus', () => {
  it('retains a keyboard-operated refresh control across failed, empty and ready states', async () => {
    const user = userEvent.setup();
    const { rerender } = render(await RestrictedCommunicationNotice({ state: 'failed' }));
    expect(screen.getByText('failed')).toBeInTheDocument();
    await user.tab();
    const button = screen.getByRole('button', { name: 'retry' });
    expect(button).toBeFocused();
    await user.keyboard('{Enter}');
    expect(mocks.refresh).toHaveBeenCalledOnce();
    rerender(await RestrictedCommunicationNotice({ state: 'empty' }));
    expect(button).toBeFocused();
    expect(screen.getByText('empty')).toBeInTheDocument();
    rerender(await RestrictedCommunicationNotice({}));
    expect(button).toBeFocused();
    expect(screen.getByText('restriction')).toBeInTheDocument();
  });
  it('keeps unavailable and failed copy distinct', async () => {
    render(await RestrictedCommunicationNotice({ state: 'unavailable' }));
    expect(screen.getByText('unavailable')).toBeInTheDocument();
    expect(screen.queryByText('empty')).not.toBeInTheDocument();
    expect(screen.queryByText('failed')).not.toBeInTheDocument();
  });
});
