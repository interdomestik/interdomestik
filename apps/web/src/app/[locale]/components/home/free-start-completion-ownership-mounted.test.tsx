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
import { PublicEntryVehicleAction } from './public-entry-vehicle-action';
import { takePendingPublicEntryIntent } from './public-entry-intent';

const copy = freeStartMessages.freeStart;
const success = { success: true, data: {} };
function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => {
    resolve = accept;
  });
  return { promise, resolve };
}
function renderPublicOrganizer() {
  render(
    <>
      <PublicEntryPropertyAction label="Property problem" />
      <PublicEntryVehicleAction label="Vehicle problem" />
      <FreeStartIntakeShell
        continueHref="/pricing"
        locale="en"
        tenantId="tenant_public"
        neutralOtpHost={location.host}
      />
    </>
  );
}
async function enter(category: 'vehicle' | 'property') {
  fireEvent.click(screen.getByTestId(`public-entry-${category}`));
  await screen.findByLabelText(copy.details.summary);
  await waitFor(() =>
    expect(screen.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert')
  );
}
function fillAndPreview(category: 'vehicle' | 'property', summary: string) {
  const fields = {
    summary,
    incidentDate: '2026-10-03',
    counterparty: 'Example insurer',
    desiredOutcome: 'repair',
    issueType: category === 'property' ? 'water_damage' : 'collision',
  };
  for (const [field, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(copy.details[field as keyof typeof copy.details]), {
      target: { value },
    });
  }
  fireEvent.click(screen.getByRole('button', { name: copy.details.continue }));
}
function finish() {
  fireEvent.click(screen.getByRole('button', { name: copy.preview.finish }));
}
function pack(body: string) {
  const result = createGeneratedClaimPackFixture();
  return { success: true, data: { ...result, letter: { ...result.letter, body } } };
}

describe('mounted completion ownership across real public selections', () => {
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
    boundary.submit.mockResolvedValue(success);
    boundary.pack.mockResolvedValue({ success: false, code: 'GENERATION_FAILED' });
  });

  it('keeps new editable facts when an older intake request finishes', async () => {
    const submit = held<typeof success>();
    boundary.submit.mockReturnValueOnce(submit.promise);
    renderPublicOrganizer();
    await enter('property');
    fillAndPreview('property', 'Original property facts.');
    finish();
    expect(boundary.submit).toHaveBeenCalledTimes(1);
    await enter('vehicle');
    const narrative = screen.getByLabelText(copy.details.summary);
    fireEvent.change(narrative, { target: { value: 'Current vehicle facts.' } });
    await act(async () => {
      submit.resolve(success);
      await submit.promise;
    });
    expect(screen.getByLabelText(copy.details.summary)).toBe(narrative);
    expect(narrative).toHaveValue('Current vehicle facts.');
    expect(screen.queryByTestId('free-start-complete-pending-pack')).toBeNull();
    expect(boundary.submit).toHaveBeenCalledTimes(1);
    expect(boundary.pack).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
  });

  it('does not install an old pack after returning to edit the same category', async () => {
    const generation = held<ReturnType<typeof pack>>();
    boundary.pack.mockReturnValueOnce(generation.promise);
    renderPublicOrganizer();
    await enter('property');
    fillAndPreview('property', 'Original property facts.');
    finish();
    await waitFor(() => expect(boundary.pack).toHaveBeenCalledTimes(1));
    await enter('property');
    fireEvent.change(screen.getByLabelText(copy.details.summary), {
      target: { value: 'Updated property facts.' },
    });
    await act(async () => {
      generation.resolve(pack('Obsolete result A'));
      await generation.promise;
    });
    expect(screen.queryByTestId('claim-pack-result')).toBeNull();
    expect(screen.getByLabelText(copy.details.summary)).toHaveValue('Updated property facts.');
    // Only the customer's next explicit finish may start another pair of actions.
    fillAndPreview('property', 'Updated property facts.');
    const current = held<ReturnType<typeof pack>>();
    boundary.pack.mockReturnValueOnce(current.promise);
    finish();
    await waitFor(() => expect(boundary.pack).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('claim-pack-letter')).toBeNull();
    await act(async () => {
      current.resolve(pack('Current result B'));
      await current.promise;
    });
    expect(await screen.findByTestId('claim-pack-letter')).toHaveTextContent('Current result B');
    expect(boundary.submit).toHaveBeenCalledTimes(2);
    expect(localStorage).toHaveLength(0);
  });

  it('keeps the newer result when the previous pack arrives last', async () => {
    const old = held<ReturnType<typeof pack>>(),
      current = held<ReturnType<typeof pack>>();
    boundary.pack.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    renderPublicOrganizer();
    await enter('property');
    fillAndPreview('property', 'Original property facts.');
    finish();
    await waitFor(() => expect(boundary.pack).toHaveBeenCalledTimes(1));
    await enter('property');
    fillAndPreview('property', 'Updated property facts.');
    finish();
    await waitFor(() => expect(boundary.pack).toHaveBeenCalledTimes(2));
    await act(async () => {
      current.resolve(pack('Current result B'));
      await current.promise;
    });
    expect(await screen.findByTestId('claim-pack-letter')).toHaveTextContent('Current result B');
    await act(async () => {
      old.resolve(pack('Obsolete result A'));
      await old.promise;
    });
    expect(screen.getByTestId('claim-pack-letter')).toHaveTextContent('Current result B');
    expect(screen.getByTestId('claim-pack-letter')).not.toHaveTextContent('Obsolete result A');
    expect(boundary.submit).toHaveBeenCalledTimes(2);
    expect(boundary.pack).toHaveBeenCalledTimes(2);
    expect(localStorage).toHaveLength(0);
  });
});
