import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/messages/en/freeStart.json';
import { BrowserRecoveryDisclosure } from './browser-recovery-disclosure';
import { ANONYMOUS_DRAFT_KEY } from './anonymous-draft-recovery';
import { useAnonymousDraftRecovery } from './use-anonymous-draft-recovery';

vi.mock('next-intl', () => ({
  useTranslations: () => ({ raw: () => en.freeStart.localRecoveryDisclosure }),
}));

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: vi.fn(async (_name, _options, callback) => callback()) },
  });
});

describe('BrowserRecoveryDisclosure', () => {
  it('presents the complete pre-persistence choice with keyboard-reachable actions', () => {
    const onEnable = vi.fn();
    const onSkip = vi.fn();
    render(<BrowserRecoveryDisclosure decision="pending" onEnable={onEnable} onSkip={onSkip} />);

    const disclosure = screen.getByTestId('browser-recovery-disclosure');
    expect(disclosure).toHaveAccessibleName('Choose whether this browser remembers your notes');
    expect(disclosure).toHaveTextContent('vehicle or property facts');
    expect(disclosure).toHaveTextContent('screened for common medical terms');
    expect(disclosure).toHaveTextContent('Free text cannot be guaranteed free of health details');
    expect(disclosure).toHaveTextContent('shared or public device');
    expect(disclosure).toHaveTextContent('expires after 30 days');
    expect(disclosure).toHaveTextContent('discard it at any time');
    expect(disclosure).toHaveTextContent('Secure save is separate');
    expect(disclosure).toHaveTextContent('review the facts before any later handoff');

    fireEvent.click(screen.getByRole('button', { name: 'Use browser recovery' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue without device save' }));
    expect(onEnable).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('keeps the declined path truthful and reversible', () => {
    const onEnable = vi.fn();
    render(<BrowserRecoveryDisclosure decision="disabled" onEnable={onEnable} onSkip={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Browser recovery is off');
    expect(screen.getByRole('status')).toHaveTextContent('Nothing is being written');
    fireEvent.click(screen.getByRole('button', { name: 'Turn on browser recovery' }));
    expect(onEnable).toHaveBeenCalledOnce();
  });

  it('does not write eligible facts until the user enables browser recovery', async () => {
    const draft = {
      counterparty: 'Northwind Insurance',
      desiredOutcome: 'repair' as const,
      incidentDate: '2026-09-20',
      issueType: 'collision' as const,
      summary: 'Rear bumper damage.',
    };
    const initial = {
      activeId: null,
      allowWrites: false,
      category: 'vehicle' as const,
      draft,
      lifecycleState: 'idle' as const,
      neutralHost: globalThis.location.host,
      onReset: vi.fn(),
      onRestore: vi.fn(),
      resetCategory: null,
      step: 'details' as const,
    };
    const hook = renderHook(props => useAnonymousDraftRecovery(props), {
      initialProps: initial,
    });

    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
    expect(hook.result.current.enabled).toBe(false);
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull();

    hook.rerender({ ...initial, allowWrites: true });
    await waitFor(() => expect(hook.result.current.state).toBe('saved'));
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Rear bumper damage.');
  });
});
