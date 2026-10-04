import { createSupportContactsMock } from '@/test/free-start-organizer-harness';
import { createDraftWriterMock, createIdentityMock } from '@/test/public-intake-fixture';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import accidentCopy from '@/messages/en/accidentJourney.json';
import freeStartCopy from '@/messages/en/freeStart.json';
import propertyCopy from '@/messages/en/propertyJourney.json';
import { createUseTranslationsMock } from '@/test/next-intl-mock';

const boundaries = vi.hoisted(() => ({ writer: vi.fn(), identity: vi.fn() }));
vi.mock('next-intl', () => ({
  useTranslations: createUseTranslationsMock(() => ({
    ...freeStartCopy,
    ...accidentCopy,
    ...propertyCopy,
    common: { errors: { retry: 'Please try again.' } },
  })),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/support-contacts', () => createSupportContactsMock());
vi.mock('@/actions/free-start.core', () => ({ submitFreeStartIntake: boundaries.writer }));
vi.mock('@/actions/claim-pack.core', () => ({ generateClaimPackAction: boundaries.writer }));
vi.mock('@/actions/free-start-drafts', () => createDraftWriterMock(boundaries.writer));
vi.mock('@/lib/auth-client', () => createIdentityMock(boundaries.identity));

import { FreeStartIntakeShell } from './free-start-intake-shell';
import { writeAnonymousDraft } from './free-start-intake-shell/anonymous-draft-recovery';
import { dispatchPublicEntryIntent, takePendingPublicEntryIntent } from './public-entry-intent';

const copy = freeStartCopy.freeStart;
const shellProps = {
  continueHref: '/pricing',
  locale: 'en',
  neutralOtpHost: globalThis.location.host,
  tenantId: 'tenant_public',
};

function announceSituation(category: 'vehicle' | 'property') {
  act(() => dispatchPublicEntryIntent(category));
}

function fillFacts(issue: string) {
  const narrative = screen.getByLabelText(copy.details.summary);
  fireEvent.change(narrative, { target: { value: 'A tree damaged the garage and vehicle.' } });
  fireEvent.change(screen.getByLabelText(copy.details.incidentDate), {
    target: { value: '2026-10-03' },
  });
  fireEvent.change(screen.getByLabelText(copy.details.counterparty), {
    target: { value: 'Example insurer' },
  });
  fireEvent.change(screen.getByLabelText(copy.details.desiredOutcome), {
    target: { value: 'repair' },
  });
  fireEvent.change(screen.getByLabelText(copy.details.issueType), { target: { value: issue } });
  return narrative;
}

async function waitForEditableEditor() {
  await waitFor(() =>
    expect(screen.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert')
  );
}

function expectCommonFacts() {
  expect(screen.getByLabelText(copy.details.summary)).toHaveValue(
    'A tree damaged the garage and vehicle.'
  );
  expect(screen.getByLabelText(copy.details.incidentDate)).toHaveValue('2026-10-03');
  expect(screen.getByLabelText(copy.details.counterparty)).toHaveValue('Example insurer');
  expect(screen.getByLabelText(copy.details.desiredOutcome)).toHaveValue('repair');
}

function seedPropertyNotes() {
  writeAnonymousDraft(
    localStorage,
    {
      category: 'property',
      draft: {
        counterparty: 'Example insurer',
        desiredOutcome: 'repair',
        incidentDate: '2026-10-03',
        issueType: 'water_damage',
        summary: 'Water damaged the garage.',
      },
      resumeStep: 'details',
    },
    null
  );
}

function expectNoTransmission() {
  expect(boundaries.writer).not.toHaveBeenCalled();
  expect(boundaries.identity).not.toHaveBeenCalled();
  expect(localStorage).toHaveLength(0);
}

describe('mounted problem-first intake with the real organizer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    localStorage.clear();
    takePendingPublicEntryIntent();
    history.replaceState(null, '', '/');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: vi.fn((_name, _options, callback) => Promise.resolve(callback())) },
    });
  });

  it.each(['vehicle', 'property'] as const)(
    'opens editable %s facts from one public situation selection',
    async category => {
      render(<FreeStartIntakeShell {...shellProps} />);
      announceSituation(category);
      const narrative = await screen.findByLabelText(copy.details.summary);
      await waitForEditableEditor();
      fireEvent.change(narrative, { target: { value: 'Here is the problem I need help with.' } });
      expect(narrative).toHaveValue('Here is the problem I need help with.');
      expect(
        screen.queryByLabelText(accidentCopy.accidentJourney.countries.incidentLabel)
      ).toBeNull();
      expect(
        screen.queryByLabelText(propertyCopy.propertyJourney.countries.propertyLabel)
      ).toBeNull();
      expectNoTransmission();
    }
  );

  it.each(['vehicle', 'property'] as const)(
    'opens %s facts directly from the organizer category fallback',
    async category => {
      render(<FreeStartIntakeShell {...shellProps} />);
      fireEvent.click(screen.getByTestId(`free-start-category-${category}`));
      const narrative = await screen.findByLabelText(copy.details.summary);
      await waitForEditableEditor();
      fireEvent.change(narrative, { target: { value: 'I want to explain the damage.' } });
      expect(narrative).toHaveValue('I want to explain the damage.');
      expectNoTransmission();
    }
  );

  it('puts the narrative before secondary facts and an optional recovery decision', async () => {
    render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
    const narrative = screen.getByLabelText(copy.details.summary);
    const issue = screen.getByLabelText(copy.details.issueType);
    const recovery = await screen.findByRole('button', {
      name: copy.localRecoveryDisclosure.enable,
    });
    expect(narrative.compareDocumentPosition(issue) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(narrative.compareDocumentPosition(recovery) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0
    );
    expectNoTransmission();
  });

  it('preserves the same editor, focus and compatible facts on repeated public selection', async () => {
    const { rerender } = render(
      <FreeStartIntakeShell {...shellProps} initialCategory="vehicle" publicEntryEnabled />
    );
    await waitForEditableEditor();
    const narrative = fillFacts('collision');
    narrative.focus();
    announceSituation('vehicle');
    announceSituation('vehicle');
    rerender(
      <FreeStartIntakeShell {...{ ...shellProps }} initialCategory="vehicle" publicEntryEnabled />
    );
    expect(screen.getByLabelText(copy.details.summary)).toBe(narrative);
    expect(narrative).toHaveFocus();
    expectCommonFacts();
    expect(screen.getByLabelText(copy.details.issueType)).toHaveValue('collision');
    expectNoTransmission();
  });

  it('retains common facts when deliberately changing situation and clears incompatible issue', async () => {
    render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
    await waitForEditableEditor();
    fillFacts('collision');
    announceSituation('property');
    expectCommonFacts();
    expect(screen.getByLabelText(copy.details.issueType)).toHaveValue('');
    fireEvent.change(screen.getByLabelText(copy.details.issueType), {
      target: { value: 'water_damage' },
    });
    announceSituation('property');
    expectCommonFacts();
    expect(screen.getByLabelText(copy.details.issueType)).toHaveValue('water_damage');
    expectNoTransmission();
  });

  it('preserves facts and the issue when choosing the current category again', async () => {
    render(<FreeStartIntakeShell {...shellProps} initialCategory="property" />);
    await waitForEditableEditor();
    fillFacts('water_damage');
    fireEvent.click(screen.getByRole('button', { name: copy.selectedSituation.change }));
    fireEvent.click(screen.getByTestId('free-start-category-property'));
    expectCommonFacts();
    expect(screen.getByLabelText(copy.details.issueType)).toHaveValue('water_damage');
    expectNoTransmission();
  });

  it.each(['vehicle', 'property'] as const)(
    'does not carry injury-origin facts into recovery-eligible %s entry',
    async category => {
      render(<FreeStartIntakeShell {...shellProps} initialCategory="injury" />);
      await waitForEditableEditor();
      fillFacts('workplace_injury');
      fireEvent.change(screen.getByLabelText(copy.details.summary), {
        target: { value: 'I was injured at work and have medical documents.' },
      });
      announceSituation(category);
      expect(screen.getByLabelText(copy.details.summary)).toHaveValue('');
      expect(screen.getByLabelText(copy.details.incidentDate)).toHaveValue('');
      expect(screen.getByLabelText(copy.details.counterparty)).toHaveValue('');
      expect(screen.getByLabelText(copy.details.issueType)).toHaveValue('');
      expectNoTransmission();
    }
  );

  it('consumes a pre-listener vehicle selection without making safety answers prerequisites', async () => {
    dispatchPublicEntryIntent('vehicle');
    render(<FreeStartIntakeShell {...shellProps} />);
    expect(await screen.findByLabelText(copy.details.summary)).toBeInTheDocument();
    expectNoTransmission();
  });

  it.each(['offer', 'resume'] as const)(
    'keeps restored facts authoritative on public entry during %s',
    async moment => {
      seedPropertyNotes();
      render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
      await screen.findByRole('button', { name: 'Continue with these notes' });
      const offeredCopy = localStorage.getItem('interdomestik_free_start_recovery_v1');
      const resume = screen.getByRole('button', { name: 'Continue with these notes' });
      let finishResume = () => {};
      if (moment === 'resume') {
        const request = navigator.locks.request as ReturnType<typeof vi.fn>;
        request.mockImplementationOnce(
          (_name, _options, callback) =>
            new Promise(resolve => {
              finishResume = () => resolve(callback());
            })
        );
        fireEvent.click(resume);
        await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
      }
      announceSituation('vehicle');
      expect(screen.getByTestId('anonymous-draft-recovery-offer')).toBeVisible();
      expect(screen.getByTestId('free-start-recovery-editor')).toHaveAttribute('inert');
      expect(localStorage.getItem('interdomestik_free_start_recovery_v1')).toBe(offeredCopy);
      if (moment === 'resume') await act(async () => finishResume());
      else fireEvent.click(resume);
      await waitFor(() =>
        expect(screen.getByLabelText(copy.details.summary)).toHaveValue('Water damaged the garage.')
      );
      expect(screen.getByLabelText(copy.details.issueType)).toHaveValue('water_damage');
      expect(boundaries.writer).not.toHaveBeenCalled();
      expect(boundaries.identity).not.toHaveBeenCalled();
    }
  );

  it('does not replay an initial hero category over deliberately recovered facts', async () => {
    seedPropertyNotes();
    const { rerender } = render(<FreeStartIntakeShell {...shellProps} initialCategory="vehicle" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with these notes' }));
    await waitFor(() =>
      expect(screen.getByLabelText(copy.details.summary)).toHaveValue('Water damaged the garage.')
    );
    const narrative = screen.getByLabelText(copy.details.summary);
    rerender(<FreeStartIntakeShell {...{ ...shellProps }} initialCategory="vehicle" />);
    expect(screen.getByLabelText(copy.details.summary)).toBe(narrative);
    expect(screen.getByLabelText(copy.details.issueType)).toHaveValue('water_damage');
    expect(boundaries.writer).not.toHaveBeenCalled();
    expect(boundaries.identity).not.toHaveBeenCalled();
  });
});
