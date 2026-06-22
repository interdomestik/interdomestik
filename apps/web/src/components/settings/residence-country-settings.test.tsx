import { updateResidenceCountry } from '@/actions/user-settings';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentPropsWithoutRef, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResidenceCountrySettings } from './residence-country-settings';

type ButtonProps = PropsWithChildren<ComponentPropsWithoutRef<'button'>>;
type DivProps = PropsWithChildren<ComponentPropsWithoutRef<'div'>>;
type HeadingProps = PropsWithChildren<ComponentPropsWithoutRef<'h3'>>;
type InputProps = ComponentPropsWithoutRef<'input'>;
type LabelProps = PropsWithChildren<ComponentPropsWithoutRef<'label'>>;
type ParagraphProps = PropsWithChildren<ComponentPropsWithoutRef<'p'>>;

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({ children, ...props }: ButtonProps) => <button {...props}>{children}</button>,
}));

vi.mock('@interdomestik/ui/components/card', () => ({
  Card: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }: ParagraphProps) => <p {...props}>{children}</p>,
  CardHeader: ({ children, ...props }: DivProps) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: HeadingProps) => <h3 {...props}>{children}</h3>,
}));

vi.mock('@interdomestik/ui/components/input', () => ({
  Input: (props: InputProps) => <input {...props} />,
}));

vi.mock('@interdomestik/ui/components/label', () => ({
  Label: ({ children, ...props }: LabelProps) => <label {...props}>{children}</label>,
}));

vi.mock('lucide-react', () => ({ MapPin: () => <span /> }));

vi.mock('@/actions/user-settings', () => ({
  updateResidenceCountry: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      description: 'Residence description',
      error: 'Failed',
      label: 'Country code',
      placeholder: 'DE',
      save: 'Save country',
      saving: 'Saving...',
      success: 'Updated',
      title: 'Residence country',
      'decision.deferred_active_recovery_runoff': 'Run-off decision',
      'decision.pending_terms_reacceptance': 'Pending terms decision',
    };
    return translations[key] ?? key;
  },
}));

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));

describe('ResidenceCountrySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables saving unchanged or malformed country codes', () => {
    render(<ResidenceCountrySettings initialResidenceCountry="DE" />);

    expect(screen.getByRole('button', { name: 'Save country' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'D' } });
    expect(screen.getByRole('button', { name: 'Save country' })).toBeDisabled();
  });

  it('submits normalized residence country and renders policy decision evidence', async () => {
    vi.mocked(updateResidenceCountry).mockResolvedValue({
      decision: {
        changeState: 'pending_terms_reacceptance',
        toResidenceCountry: 'AT',
      },
      eventId: 'event-1',
      success: true,
    });

    render(<ResidenceCountrySettings initialResidenceCountry="DE" />);
    fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'at' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save country' }));

    await waitFor(() => expect(updateResidenceCountry).toHaveBeenCalledWith('AT'));
    expect(await screen.findByTestId('residence-country-decision')).toHaveTextContent(
      'Pending terms decision'
    );
    expect(toast.success).toHaveBeenCalledWith('Updated');
  });

  it('does not show success or stale decision text when the server reports unchanged', async () => {
    vi.mocked(updateResidenceCountry).mockResolvedValue({
      decision: {
        changeState: 'unchanged',
        toResidenceCountry: 'AT',
      },
      eventId: null,
      success: true,
    });

    render(<ResidenceCountrySettings initialResidenceCountry="DE" />);
    fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'AT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save country' }));

    await waitFor(() => expect(updateResidenceCountry).toHaveBeenCalledWith('AT'));
    expect(screen.queryByTestId('residence-country-decision')).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Save country' })).toBeDisabled();
  });

  it('shows the server error without changing the saved state', async () => {
    vi.mocked(updateResidenceCountry).mockResolvedValue({
      error: 'Too many requests. Please try again later.',
      success: false,
    });

    render(<ResidenceCountrySettings initialResidenceCountry="DE" />);
    fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'AT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save country' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed', expect.any(Object)));
    expect(screen.getByRole('button', { name: 'Save country' })).not.toBeDisabled();
  });
});
