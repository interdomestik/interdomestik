import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BusinessLeadForm } from './business-lead-form';

vi.mock('@/lib/actions/business-membership-lead', () => ({
  submitBusinessMembershipLead: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('lucide-react', () => ({
  CheckCircle2: () => <span>check</span>,
  Loader2: () => <span>loading</span>,
}));

describe('BusinessLeadForm', () => {
  it('renders the assisted business intake fields and hidden locale context', () => {
    render(<BusinessLeadForm locale="sq" />);

    expect(screen.getByTestId('business-lead-form')).toBeInTheDocument();
    expect(screen.getByLabelText('fields.firstName')).toBeInTheDocument();
    expect(screen.getByLabelText('fields.companyName')).toBeInTheDocument();
    expect(screen.getByLabelText('fields.teamSize')).toBeInTheDocument();

    const localeInput = document.querySelector('input[name="locale"]') as HTMLInputElement;
    const idempotencyInput = document.querySelector(
      'input[name="_idempotencyKey"]'
    ) as HTMLInputElement;

    expect(localeInput.value).toBe('sq');
    expect(idempotencyInput.value).not.toBe('');
  });
});
