import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createLeadAction: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/actions/leads/create', () => ({ createLeadAction: hoisted.createLeadAction }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: hoisted.refresh }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({
  toast: { error: hoisted.toastError, success: hoisted.toastSuccess },
}));

import { CreateLeadDialog } from './CreateLeadDialog';

function openAndFill() {
  render(<CreateLeadDialog />);
  fireEvent.click(screen.getByTestId('new-lead-button'));
  fireEvent.change(screen.getByTestId('lead-form-firstname'), { target: { value: 'Arta' } });
  fireEvent.change(screen.getByTestId('lead-form-lastname'), { target: { value: 'Krasniqi' } });
  fireEvent.change(screen.getByTestId('lead-form-email'), {
    target: { value: 'arta@example.com' },
  });
  fireEvent.change(screen.getByTestId('lead-form-phone'), { target: { value: '+38344111222' } });
}

const submit = () => fireEvent.submit(screen.getByTestId('create-lead-form'));

describe('CreateLeadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.createLeadAction.mockResolvedValue({ success: true, data: { leadId: 'lead_1' } });
  });

  it('keeps submit disabled and sends nothing until the agent confirms the notice', () => {
    openAndFill();
    expect(screen.getByTestId('lead-form-notice')).toHaveTextContent('notice.body');
    expect(screen.getByTestId('lead-form-submit')).toBeDisabled();
    submit();
    expect(hoisted.createLeadAction).not.toHaveBeenCalled();
  });

  it('shows company fields and the company notice only for a company lead', () => {
    openAndFill();
    expect(screen.queryByTestId('lead-form-company')).toBeNull();
    fireEvent.click(screen.getByTestId('lead-form-kind-company'));
    expect(screen.getByTestId('lead-form-company')).toBeRequired();
    expect(screen.getByTestId('lead-form-notice')).toHaveTextContent('notice.company');
  });

  it('sends the confirmed lead with one request key, reused on retry after a failure', async () => {
    hoisted.createLeadAction.mockResolvedValueOnce({ success: false, code: 'INTERNAL' });
    openAndFill();
    fireEvent.click(screen.getByTestId('lead-form-consent'));
    submit();
    await waitFor(() => expect(hoisted.toastError).toHaveBeenCalledWith('errors.generic'));
    submit();
    await waitFor(() => expect(hoisted.createLeadAction).toHaveBeenCalledTimes(2));

    const [first, second] = hoisted.createLeadAction.mock.calls;
    expect(first?.[0]).toMatchObject({
      leadKind: 'individual',
      email: 'arta@example.com',
      consentConfirmed: true,
      companyName: undefined,
    });
    expect(first?.[1]).toEqual(expect.any(String));
    expect(second?.[1]).toBe(first?.[1]);
    await waitFor(() => expect(hoisted.refresh).toHaveBeenCalled());
  });

  it('explains a possible duplicate instead of a generic error', async () => {
    hoisted.createLeadAction.mockResolvedValue({ success: false, code: 'POSSIBLE_DUPLICATE' });
    openAndFill();
    fireEvent.click(screen.getByTestId('lead-form-consent'));
    submit();
    await waitFor(() => expect(hoisted.toastError).toHaveBeenCalledWith('errors.duplicate'));
  });
});
