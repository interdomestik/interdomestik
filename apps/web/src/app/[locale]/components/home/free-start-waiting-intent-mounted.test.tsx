import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import freeStartCopy from '@/messages/en/freeStart.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

const boundaries = vi.hoisted(() => ({ writer: vi.fn(), identity: vi.fn() }));
vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({
    ...freeStartCopy,
    common: { errors: { retry: 'Please try again.' } },
  })),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    scroll: _scroll,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    scroll?: boolean;
  }) => <a {...props}>{children}</a>,
}));
vi.mock('@/lib/support-contacts', () => ({
  getSupportContacts: () => ({ telHref: 'tel:+38349900600' }),
}));
vi.mock('@/actions/free-start.core', () => ({ submitFreeStartIntake: boundaries.writer }));
vi.mock('@/actions/claim-pack.core', () => ({ generateClaimPackAction: boundaries.writer }));
vi.mock('@/actions/free-start-drafts', () => ({
  createFreeStartDraft: boundaries.writer,
  deleteFreeStartDraft: boundaries.writer,
  listFreeStartDrafts: boundaries.writer,
  resumeFreeStartDraft: boundaries.writer,
  updateFreeStartDraft: boundaries.writer,
}));
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: boundaries.identity },
    signIn: { emailOtp: boundaries.identity },
  },
}));

import { FreeStartIntakeShell } from './free-start-intake-shell';
import { PublicEntryPropertyAction } from './public-entry-property-action';
import { PublicEntryVehicleAction } from './public-entry-vehicle-action';
import { dispatchPublicEntryIntent, takePendingPublicEntryIntent } from './public-entry-intent';

let finishRead: () => void;
let frames: Map<number, FrameRequestCallback>;
const scroll = vi.fn();
const props = {
  continueHref: '/pricing',
  locale: 'en',
  neutralOtpHost: globalThis.location.host,
  tenantId: 'tenant_public',
};

function mountEntry() {
  render(
    <>
      <PublicEntryVehicleAction label="Report vehicle damage" />
      <PublicEntryPropertyAction label="Report property damage" />
      <FreeStartIntakeShell {...props} />
    </>
  );
}

async function settleInitialRead() {
  await act(async () => finishRead());
  await waitFor(() =>
    expect(screen.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert')
  );
  await screen.findByLabelText(freeStartCopy.freeStart.details.summary);
  const pending = [...frames.values()];
  frames.clear();
  act(() => pending.forEach(callback => callback(0)));
}

function expectVehicleFactsWithoutSideEffects() {
  expect(screen.getByTestId('free-start-urgent-advice')).toHaveAttribute(
    'data-category',
    'vehicle'
  );
  expect(screen.getByLabelText(freeStartCopy.freeStart.details.summary)).toBeEnabled();
  expect(boundaries.writer).not.toHaveBeenCalled();
  expect(boundaries.identity).not.toHaveBeenCalled();
  expect(localStorage).toHaveLength(0);
}

describe('mounted public intent waiting for the actual initial recovery read', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    localStorage.clear();
    takePendingPublicEntryIntent();
    history.replaceState(null, '', '/');
    frames = new Map();
    let sequence = 0;
    scroll.mockReset();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.set(++sequence, callback);
        return sequence;
      })
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => frames.delete(id))
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll,
    });
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: vi.fn(
          (_name, _options, callback) =>
            new Promise(resolve => {
              finishRead = () => resolve(callback());
            })
        ),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['focus', 'keyboard', 'pointer'] as const)(
    'keeps newer %s ownership after one hero selection waits for recovery',
    async interaction => {
      const user = userEvent.setup();
      mountEntry();
      await waitFor(() => expect(navigator.locks.request).toHaveBeenCalledOnce());
      await user.click(screen.getByRole('link', { name: 'Report vehicle damage' }));
      expect(screen.getByTestId('free-start-recovery-editor')).toHaveAttribute('inert');
      const newer = screen.getByRole('link', { name: 'Report property damage' });
      if (interaction === 'keyboard') await user.tab();
      else if (interaction === 'pointer')
        await user.pointer({ target: newer, keys: '[MouseLeft>]' });
      else newer.focus();
      expect(newer).toHaveFocus();
      await settleInitialRead();
      expectVehicleFactsWithoutSideEffects();
      expect(newer).toHaveFocus();
      expect(scroll).not.toHaveBeenCalled();
    }
  );

  it('allows the unchanged cold intent to arrive once after the initial read', async () => {
    const user = userEvent.setup();
    mountEntry();
    await waitFor(() => expect(navigator.locks.request).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('link', { name: 'Report vehicle damage' }));
    await settleInitialRead();
    expectVehicleFactsWithoutSideEffects();
    expect(
      screen.getByRole('heading', { name: freeStartCopy.freeStart.details.summary })
    ).toHaveFocus();
    expect(screen.getByLabelText(freeStartCopy.freeStart.details.summary)).not.toHaveFocus();
    expect(scroll).toHaveBeenCalledOnce();
  });

  it('preserves a pre-listener intent through the unresolved initial read', async () => {
    dispatchPublicEntryIntent('vehicle');
    mountEntry();
    await waitFor(() => expect(navigator.locks.request).toHaveBeenCalledOnce());
    await settleInitialRead();
    expectVehicleFactsWithoutSideEffects();
    expect(
      screen.getByRole('heading', { name: freeStartCopy.freeStart.details.summary })
    ).toHaveFocus();
    expect(scroll).toHaveBeenCalledOnce();
  });
});
