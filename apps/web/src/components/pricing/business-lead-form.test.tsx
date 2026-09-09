import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BusinessLeadForm } from './business-lead-form';

const submit = vi.hoisted(() => vi.fn(async (_: unknown, _data: FormData) => null));

vi.mock('@/lib/actions/business-membership-lead', () => ({
  submitBusinessMembershipLead: submit,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('BusinessLeadForm', () => {
  it('renders the assisted business intake fields and creates idempotency at submit time', async () => {
    const { container } = render(<BusinessLeadForm locale="sq" />);
    const form = container.querySelector('form')!;
    const key = form.elements.namedItem('_idempotencyKey') as HTMLInputElement;

    expect(key.value).toBe('');
    fireEvent.submit(form);
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect((submit.mock.calls[0]?.[1] as FormData).get('_idempotencyKey')).toEqual(
      expect.any(String)
    );
  });
});
