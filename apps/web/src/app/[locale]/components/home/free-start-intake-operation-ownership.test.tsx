import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import freeStartMessages from '@/messages/en/freeStart.json';
import { createGeneratedClaimPackFixture } from '@/test/free-start-claim-pack-fixture';
import {
  createFreeStartAnalyticsMock,
  createFreeStartTranslationsMock,
  createRoutingLinkMock,
  createSupportContactsMock,
} from '@/test/free-start-organizer-harness';

const boundary = vi.hoisted(() => ({ submit: vi.fn(), pack: vi.fn(), completed: vi.fn() }));
vi.mock('next-intl', () => createFreeStartTranslationsMock(() => 'en'));
vi.mock('@/i18n/routing', () => createRoutingLinkMock());
vi.mock('@/lib/support-contacts', () => createSupportContactsMock());
vi.mock('@/lib/analytics', () => createFreeStartAnalyticsMock(boundary.completed));
vi.mock('@/actions/free-start.core', () => ({ submitFreeStartIntake: boundary.submit }));
vi.mock('@/actions/claim-pack.core', () => ({ generateClaimPackAction: boundary.pack }));

import { FreeStartIntakeShell } from './free-start-intake-shell';
import { PublicEntryPropertyAction } from './public-entry-property-action';
import { takePendingPublicEntryIntent } from './public-entry-intent';

const copy = freeStartMessages.freeStart;
const accepted = { success: true, data: {} };
// The real intake action answers with these codes; a rate limit is the retryable rejection.
const rejected = {
  success: false,
  error: 'Too many requests. Please try again later.',
  code: 'RATE_LIMITED',
};
const retryMessage = 'Please try again. If the problem persists, contact support.';

function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => {
    resolve = accept;
  });
  return { promise, resolve };
}
function renderOrganizer() {
  render(
    <>
      <PublicEntryPropertyAction label="Property problem" />
      <FreeStartIntakeShell
        continueHref="/pricing"
        locale="en"
        tenantId="tenant_public"
        neutralOtpHost={location.host}
      />
    </>
  );
}
/** The public selection is the only way back into the facts once a result is on screen. */
async function openPropertyFacts() {
  fireEvent.click(screen.getByTestId('public-entry-property'));
  await screen.findByLabelText(copy.details.summary);
  await waitFor(() =>
    expect(screen.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert')
  );
}
function describeProblem(summary: string) {
  const facts = {
    summary,
    incidentDate: '2026-10-03',
    counterparty: 'Example insurer',
    desiredOutcome: 'repair',
    issueType: 'water_damage',
  };
  for (const [field, value] of Object.entries(facts)) {
    fireEvent.change(screen.getByLabelText(copy.details[field as keyof typeof copy.details]), {
      target: { value },
    });
  }
  fireEvent.click(screen.getByRole('button', { name: copy.details.continue }));
}
function finishButton() {
  return screen.getByRole('button', { name: copy.preview.finish });
}
function generatedPack(body: string) {
  const generated = createGeneratedClaimPackFixture();
  return { success: true, data: { ...generated, letter: { ...generated.letter, body } } };
}

describe('intake operation ownership across abandoned and explicit requests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
    boundary.submit.mockResolvedValue(accepted);
    boundary.pack.mockResolvedValue({ success: false, code: 'GENERATION_FAILED' });
  });

  it('keeps the request the customer is waiting for when an abandoned rejection lands', async () => {
    const abandoned = held<typeof rejected>(),
      current = held<typeof accepted>();
    boundary.submit.mockReturnValueOnce(abandoned.promise).mockReturnValueOnce(current.promise);
    renderOrganizer();
    await openPropertyFacts();
    describeProblem('Original property facts.');
    fireEvent.click(finishButton());
    expect(finishButton()).toBeDisabled();
    // Going back to edit while the first request is still open returns the facts to the customer
    // instead of leaving the organizer waiting for an answer it can no longer use.
    fireEvent.click(screen.getByRole('button', { name: copy.preview.back }));
    fireEvent.change(screen.getByLabelText(copy.details.summary), {
      target: { value: 'Corrected property facts.' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.details.continue }));
    expect(finishButton()).toBeEnabled();
    fireEvent.click(finishButton());
    expect(boundary.submit).toHaveBeenCalledTimes(2);

    await act(async () => {
      abandoned.resolve(rejected);
      await abandoned.promise;
    });
    expect(screen.queryByTestId('free-start-validation-error')).toBeNull();
    expect(finishButton()).toBeDisabled();
    expect(finishButton()).toHaveAttribute('aria-busy', 'true');
    expect(boundary.submit).toHaveBeenCalledTimes(2);

    await act(async () => {
      current.resolve(accepted);
      await current.promise;
    });
    expect(await screen.findByTestId('free-start-complete-pending-pack')).toBeInTheDocument();
    expect(screen.queryByTestId('free-start-validation-error')).toBeNull();
    expect(localStorage).toHaveLength(0);
  });

  it('removes an installed result when the customer returns to change the facts', async () => {
    boundary.pack.mockResolvedValueOnce(generatedPack('First prepared letter'));
    renderOrganizer();
    await openPropertyFacts();
    describeProblem('Original property facts.');
    fireEvent.click(finishButton());
    expect(await screen.findByTestId('claim-pack-letter')).toHaveTextContent(
      'First prepared letter'
    );

    await openPropertyFacts();
    // The result was about the facts as they were; re-entering the situation withdraws it.
    expect(screen.queryByTestId('claim-pack-result')).toBeNull();
    expect(screen.getByLabelText(copy.details.summary)).toHaveValue('Original property facts.');

    const current = held<ReturnType<typeof generatedPack>>();
    boundary.pack.mockReturnValueOnce(current.promise);
    describeProblem('Corrected property facts.');
    fireEvent.click(finishButton());
    await waitFor(() => expect(boundary.pack).toHaveBeenCalledTimes(2));
    await act(async () => {
      current.resolve(generatedPack('Corrected prepared letter'));
      await current.promise;
    });
    expect(await screen.findByTestId('claim-pack-letter')).toHaveTextContent(
      'Corrected prepared letter'
    );
    expect(boundary.submit).toHaveBeenCalledTimes(2);
    expect(localStorage).toHaveLength(0);
  });

  it('waits for a new explicit finish after a rejection and never reuses its request key', async () => {
    const keys: string[] = [];
    boundary.submit.mockImplementation((_intake: unknown, key: string) => {
      keys.push(key);
      return Promise.resolve(keys.length === 1 ? rejected : accepted);
    });
    renderOrganizer();
    await openPropertyFacts();
    describeProblem('Original property facts.');
    fireEvent.click(finishButton());
    expect(await screen.findByTestId('free-start-validation-error')).toHaveTextContent(
      retryMessage
    );
    expect(screen.queryByTestId('free-start-complete-pending-pack')).toBeNull();

    // Nothing is resent, saved or restarted on the organizer's own initiative.
    await act(async () => {
      await Promise.resolve();
    });
    expect(boundary.submit).toHaveBeenCalledTimes(1);
    expect(boundary.pack).not.toHaveBeenCalled();

    fireEvent.click(finishButton());
    await waitFor(() => expect(boundary.submit).toHaveBeenCalledTimes(2));
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(await screen.findByTestId('free-start-complete-pending-pack')).toBeInTheDocument();
    expect(screen.queryByTestId('free-start-validation-error')).toBeNull();
    expect(localStorage).toHaveLength(0);
  });
});
