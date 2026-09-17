import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.unmock('next-intl');
import en from '@/messages/en/agent-claims.json';
import sq from '@/messages/sq/agent-claims.json';
import mk from '@/messages/mk/agent-claims.json';
import sr from '@/messages/sr/agent-claims.json';
const h = vi.hoisted(() => ({ create: vi.fn(), refresh: vi.fn() }));
vi.mock('@/actions/staff-claims/information-request', () => ({
  createClaimInformationRequest: h.create,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh }) }));
import { ClaimInformationRequestForm } from './ClaimInformationRequestForm';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => vi.clearAllMocks());
function fill() {
  fireEvent.change(screen.getByLabelText('Information needed'), {
    target: { value: 'Repair estimate' },
  });
  fireEvent.change(screen.getByLabelText('Explanation for the member'), {
    target: { value: 'To assess damage' },
  });
  fireEvent.change(screen.getByLabelText('Due date and time'), {
    target: { value: '2000-01-01T10:00' },
  });
}
function mount() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ClaimInformationRequestForm claimId="claim-1" />
    </NextIntlClientProvider>
  );
}
it.each([
  { locale: 'en', messages: en },
  { locale: 'sq', messages: sq },
  { locale: 'mk', messages: mk },
  { locale: 'sr', messages: sr },
])('labels required fields in $locale without a date default or range', ({ locale, messages }) => {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ClaimInformationRequestForm claimId="claim-1" />
    </NextIntlClientProvider>
  );
  const copy = messages['agent-claims'].claims.informationRequest;
  expect(screen.getByLabelText(copy.requestedInformation)).toHaveAttribute('maxlength', '1000');
  const date = screen.getByLabelText(copy.dueAt);
  expect(date).toHaveValue('');
  expect(date).not.toHaveAttribute('min');
  expect(date).not.toHaveAttribute('max');
});
it('preserves correlation for uncertain retries and prevents duplicate concurrent submits', async () => {
  let reject!: (error: Error) => void;
  h.create.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  mount();
  fill();
  const button = screen.getByRole('button');
  const status = screen.getByRole('status');
  expect(status.tagName).toBe('OUTPUT');
  expect(status).toHaveAttribute('aria-live', 'polite');
  expect(status).toHaveAttribute('aria-atomic', 'true');
  const alert = screen.getByRole('alert');
  button.focus();
  fireEvent.submit(screen.getByRole('form'));
  fireEvent.submit(screen.getByRole('form'));
  expect(h.create).toHaveBeenCalledTimes(1);
  expect(button).toBeEnabled();
  expect(button).toHaveAttribute('aria-disabled', 'true');
  expect(button).toHaveFocus();
  await act(async () => reject(new Error('network')));
  expect(screen.getByRole('alert')).toHaveTextContent('Retry with the same details');
  h.create.mockResolvedValueOnce({ success: true, requestId: 'request-1' });
  fireEvent.submit(screen.getByRole('form'));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('saved'));
  expect(h.create.mock.calls[0][0]).toEqual(h.create.mock.calls[1][0]);
  expect(h.create.mock.calls[0][0]).not.toHaveProperty('responsibleStaffId');
  expect(h.refresh).toHaveBeenCalledOnce();
  expect(button).toHaveFocus();
  expect(screen.getByRole('status')).toBe(status);
  expect(screen.getByRole('alert')).toBe(alert);
});
it('rejects whitespace and preserves input on a domain error', async () => {
  mount();
  fill();
  fireEvent.change(screen.getByLabelText('Information needed'), { target: { value: '  ' } });
  fireEvent.submit(screen.getByRole('form'));
  expect(h.create).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Enter the information');
  fill();
  h.create.mockResolvedValue({ success: false, error: 'invalid_state' });
  fireEvent.submit(screen.getByRole('form'));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('verification'));
  expect(screen.getByLabelText('Information needed')).toHaveValue('Repair estimate');
});

it.each(['dueAt', 'requestedInformation', 'explanationForMember'])(
  'rejects a non-text %s value without submitting',
  field => {
    const NativeFormData = globalThis.FormData;
    vi.stubGlobal(
      'FormData',
      class extends NativeFormData {
        constructor(form?: HTMLFormElement) {
          super(form);
          this.set(field, new File(['not text'], 'unexpected.txt'));
        }
      }
    );
    mount();
    fill();
    fireEvent.submit(screen.getByRole('form'));
    expect(h.create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the information');
    expect(screen.getByLabelText('Information needed')).toHaveValue('Repair estimate');
  }
);

it('creates a valid correlation UUID when the HTTP host lacks randomUUID', async () => {
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
  h.create.mockResolvedValueOnce({ success: true, requestId: 'request-1' });
  mount();
  fill();
  fireEvent.submit(screen.getByRole('form'));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('saved'));
  expect(h.create.mock.calls[0][0].correlationId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});

it('reports entropy failure without submitting and allows a later retry', async () => {
  vi.stubGlobal('crypto', undefined);
  mount();
  fill();
  fireEvent.submit(screen.getByRole('form'));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Retry with the same details')
  );
  expect(h.create).not.toHaveBeenCalled();
  expect(screen.getByRole('button')).toBeEnabled();
  expect(screen.getByLabelText('Information needed')).toHaveValue('Repair estimate');
  vi.unstubAllGlobals();
  h.create.mockResolvedValueOnce({ success: true, requestId: 'request-1' });
  fireEvent.submit(screen.getByRole('form'));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('saved'));
});
