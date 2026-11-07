import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { BusinessLeadForm, BusinessLeadKeyProvider } from './business-lead-form';

const submit = vi.hoisted(() => vi.fn(async (_: unknown, _data: FormData) => null));

vi.mock('@/lib/actions/business-membership-lead', () => ({
  submitBusinessMembershipLead: submit,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('BusinessLeadForm', () => {
  it('includes the request key in HTML before hydration and enables submission', () => {
    for (const seed of ['request-one', 'request-two']) {
      const container = document.createElement('div');
      container.innerHTML = renderToString(
        <BusinessLeadKeyProvider value={seed}>
          <BusinessLeadForm locale="sq" />
        </BusinessLeadKeyProvider>
      );
      const form = container.querySelector('form')!;
      expect((form.elements.namedItem('_idempotencyKey') as HTMLInputElement).value).toBe(seed);
      expect((form.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(
        false
      );
      const consent = form.elements.namedItem('consent') as HTMLInputElement;
      expect([consent.type, consent.checked, consent.value]).toEqual(['checkbox', false, 'yes']);
    }
  });

  it('preserves the same request key across submission retries', async () => {
    submit.mockClear();
    const { container } = render(
      <BusinessLeadKeyProvider value="request-retry">
        <BusinessLeadForm locale="sq" />
      </BusinessLeadKeyProvider>
    );
    const form = container.querySelector('form')!;
    const key = form.elements.namedItem('_idempotencyKey') as HTMLInputElement;

    expect(key.value).toBe('request-retry');
    fireEvent.submit(form);
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    fireEvent.submit(form);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    for (const call of submit.mock.calls) {
      expect(call[1].get('_idempotencyKey')).toBe('request-retry');
      expect(call[1].get('consent')).toBeNull();
    }
  });

  it('shows the localized consent error, not the server text', async () => {
    submit.mockResolvedValueOnce({
      success: false,
      error: 'Validation failed',
      code: 'INVALID_PAYLOAD',
      issues: { consent: 'Confirm that we may contact you' },
    } as never);
    const { container } = render(
      <BusinessLeadKeyProvider value="request-consent">
        <BusinessLeadForm locale="sq" />
      </BusinessLeadKeyProvider>
    );
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByText('notice.consentRequired')).toHaveAttribute(
      'id',
      'business-lead-consent-error'
    );
    expect(screen.queryByText('Confirm that we may contact you')).toBeNull();
  });
});
