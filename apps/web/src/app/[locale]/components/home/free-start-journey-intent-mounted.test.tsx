import { createSupportContactsMock } from '@/test/free-start-organizer-harness';
import {
  createDraftWriterMock,
  createIdentityMock,
  resetPublicIntakeBrowser,
} from '@/test/public-intake-fixture';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import freeStartCopy from '@/messages/en/freeStart.json';
import injuryCopy from '@/messages/en/injuryJourney.json';
import flightCopy from '@/messages/en/flightJourney.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

const boundaries = vi.hoisted(() => ({ writer: vi.fn(), identity: vi.fn() }));
vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({
    ...freeStartCopy,
    ...injuryCopy,
    ...flightCopy,
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
vi.mock('@/lib/support-contacts', () => createSupportContactsMock());
vi.mock('@/actions/free-start.core', () => ({ submitFreeStartIntake: boundaries.writer }));
vi.mock('@/actions/claim-pack.core', () => ({ generateClaimPackAction: boundaries.writer }));
vi.mock('@/actions/free-start-drafts', () => createDraftWriterMock(boundaries.writer));
vi.mock('@/lib/auth-client', () => createIdentityMock(boundaries.identity));

import { FreeStartIntakeShell } from './free-start-intake-shell';
import { dispatchPublicEntryIntent } from './public-entry-intent';

const copy = freeStartCopy.freeStart;
const injury = injuryCopy.injuryJourney;
const props = {
  continueHref: '/pricing',
  locale: 'en',
  neutralOtpHost: globalThis.location.host,
  tenantId: 'tenant_public',
};

function announce(intent: 'vehicle' | 'property' | 'injury' | 'flight') {
  act(() => dispatchPublicEntryIntent(intent));
}

async function waitForEditor() {
  await waitFor(() =>
    expect(screen.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert')
  );
  return screen.findByLabelText(copy.details.summary);
}

function continueActualInjuryJourney() {
  fireEvent.click(screen.getByRole('button', { name: injury.urgency.no }));
  fireEvent.click(screen.getByRole('button', { name: injury.source.traffic }));
  fireEvent.change(screen.getByLabelText(injury.countries.incidentLabel), {
    target: { value: 'IT' },
  });
  fireEvent.click(screen.getByRole('button', { name: injury.countries.continue }));
  fireEvent.change(screen.getByLabelText(injury.countries.residenceLabel), {
    target: { value: 'DE' },
  });
  fireEvent.click(screen.getByRole('button', { name: injury.countries.continue }));
  fireEvent.click(screen.getByRole('button', { name: injury.evidence.continue }));
}

function expectInjuryEditor() {
  const issue = screen.getByLabelText(copy.details.issueType);
  expect(issue.querySelector('option[value="workplace_injury"]')).not.toBeNull();
  expect(screen.queryByTestId('free-start-urgent-advice')).toBeNull();
}

function expectNoSideEffects() {
  expect(boundaries.writer).not.toHaveBeenCalled();
  expect(boundaries.identity).not.toHaveBeenCalled();
  expect(localStorage).toHaveLength(0);
}

describe('real public journeys consume earlier direct category intent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    resetPublicIntakeBrowser();
  });

  it.each(['vehicle', 'property'] as const)(
    'keeps injury handoff and facts after earlier %s, then honors a new direct selection',
    async category => {
      const { rerender } = render(<FreeStartIntakeShell {...props} />);
      announce(category);
      await waitForEditor();
      announce('injury');
      expect(screen.getByTestId('injury-safety-journey')).toBeInTheDocument();
      continueActualInjuryJourney();
      const narrative = await waitForEditor();
      expectInjuryEditor();
      fireEvent.change(narrative, { target: { value: 'Facts about an incident at work.' } });
      fireEvent.change(screen.getByLabelText(copy.details.issueType), {
        target: { value: 'workplace_injury' },
      });
      rerender(<FreeStartIntakeShell {...props} />);
      expect(screen.getByLabelText(copy.details.summary)).toBe(narrative);
      expect(narrative).toHaveValue('Facts about an incident at work.');
      expect(screen.getByLabelText(copy.details.issueType)).toHaveValue('workplace_injury');
      announce('injury');
      continueActualInjuryJourney();
      await waitForEditor();
      expectInjuryEditor();
      announce(category);
      await waitForEditor();
      expect(screen.getByTestId('free-start-urgent-advice')).toHaveAttribute(
        'data-category',
        category
      );
      expectNoSideEffects();
    }
  );

  it.each(['vehicle', 'property'] as const)(
    'returns to the category chooser after earlier %s and actual flight guidance',
    async category => {
      render(<FreeStartIntakeShell {...props} />);
      announce(category);
      await waitForEditor();
      announce('flight');
      expect(screen.getByTestId('flight-disruption-journey')).toBeInTheDocument();
      act(() => {
        history.replaceState(null, '', '/');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      await waitFor(() =>
        expect(screen.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert')
      );
      expect(screen.getByTestId('free-start-category-vehicle')).toBeInTheDocument();
      expect(screen.queryByLabelText(copy.details.summary)).toBeNull();
      expectNoSideEffects();
    }
  );
});
