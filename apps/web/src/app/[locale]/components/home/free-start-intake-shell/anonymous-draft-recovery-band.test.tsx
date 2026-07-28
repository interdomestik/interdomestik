import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import en from '@/messages/en/freeStart.json';

import { AnonymousDraftRecoveryBand } from './anonymous-draft-recovery-band';

vi.mock('next-intl', () => ({
  useTranslations: () => ({
    raw: () => en.freeStart.secureSave,
  }),
}));

function recovery(state: 'discarded' | 'offer' | 'saved' | 'secure' | 'unavailable') {
  return {
    clearDeviceCopy: vi.fn(),
    discard: vi.fn(),
    offer:
      state === 'offer'
        ? {
            category: 'property',
            draft: {},
            expiresAt: '2026-08-27T12:00:00.000Z',
            resumeStep: 'preview',
            updatedAt: '2026-07-28T12:00:00.000Z',
          }
        : null,
    resume: vi.fn(),
    state,
  };
}

describe('AnonymousDraftRecoveryBand', () => {
  it('offers explicit keyboard-reachable resume and discard actions', () => {
    const value = recovery('offer');
    render(<AnonymousDraftRecoveryBand recovery={value as never} />);
    expect(screen.getByTestId('anonymous-draft-recovery-offer')).toHaveAccessibleName(
      'Continue notes from this browser?'
    );
    const resume = screen.getByRole('button', { name: 'Continue with these notes' });
    const discard = screen.getByRole('button', { name: 'Discard from this device' });
    expect(resume).toHaveClass('min-h-11');
    expect(discard).toHaveClass('min-h-11');
    fireEvent.click(resume);
    fireEvent.click(discard);
    expect(value.resume).toHaveBeenCalledOnce();
    expect(value.discard).toHaveBeenCalledOnce();
  });

  it('states the same-browser boundary after a successful local write', () => {
    render(<AnonymousDraftRecoveryBand recovery={recovery('saved') as never} />);
    const region = screen.getByTestId('anonymous-draft-recovery-status');
    expect(region).toHaveTextContent('only in this browser');
    expect(region).toHaveTextContent('not secure save');
    expect(region).toHaveTextContent('30 days');
    expect(region).toHaveTextContent('private device');
  });

  it.each(['unavailable', 'discarded', 'secure'] as const)(
    'does not claim that a browser copy is saved after the %s terminal state',
    state => {
      render(<AnonymousDraftRecoveryBand recovery={recovery(state) as never} />);
      const region = screen.getByTestId('anonymous-draft-recovery-status');
      expect(region).not.toHaveTextContent('Saved on this browser');
      expect(region).not.toHaveTextContent('can recover here for 30 days');
      expect(region).not.toHaveTextContent('saved automatically only in this browser');
    }
  );
});
