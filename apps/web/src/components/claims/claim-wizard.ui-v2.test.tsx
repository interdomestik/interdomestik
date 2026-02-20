import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimWizard } from './claim-wizard';

const mockPush = vi.fn();
const mockTrigger = vi.fn();
const mockSubmitClaim = vi.fn();

vi.mock('react-hook-form', () => {
  const actual = vi.importActual('react-hook-form');
  const mockWatch = vi.fn((arg?: unknown) => {
    if (typeof arg === 'function') {
      return { unsubscribe: vi.fn() };
    }
    return {};
  });

  return {
    ...actual,
    useForm: () => ({
      control: {},
      handleSubmit:
        (fn: (data: Record<string, unknown>) => Promise<void>) => async (e: React.FormEvent) => {
          e?.preventDefault?.();
          await fn({
            category: 'vehicle',
            title: 'Test claim title',
            companyName: 'Test Company',
            description: 'A valid description for claim submission.',
            incidentDate: '2026-02-10',
            currency: 'EUR',
            files: [],
          });
        },
      trigger: mockTrigger,
      watch: mockWatch,
      getValues: vi.fn().mockReturnValue({}),
      formState: { errors: {} },
      reset: vi.fn(),
      register: vi.fn(),
      setValue: vi.fn(),
    }),
  };
});

vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => () => ({ values: {}, errors: {} }),
}));

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const translations: Record<string, string> = {
      step1: 'Category',
      step2: 'Details',
      step3: 'Evidence',
      step4: 'Review',
      progress: 'Step {current} of {total}',
      continue_details: 'Continue -> Details',
      continue_upload: 'Continue -> Upload',
      continue_review: 'Continue -> Review',
      submit_label: 'Submit case',
      required_fields: 'Please complete required fields',
      submit_success: 'Case submitted successfully.',
      submit_failed: 'Submission failed. Please try again.',
      submit_unexpected: 'An unexpected error occurred.',
      submitClaim: 'Submit Claim',
      'help.title': 'Need help?',
      'help.call_60s': 'Get help now (60-sec call)',
      'help.whatsapp': 'WhatsApp support',
      back: 'Back',
      next: 'Next',
      processing: 'Processing...',
      title: 'Case created',
      case_id: 'Case ID',
      next_step_1: 'Step 1',
      next_step_2: 'Step 2',
      help_call: 'Call now',
      help_whatsapp: 'WhatsApp',
      go_to_claim: 'Go to case',
    };
    const message = translations[key] || key;
    if (!values) return message;
    return message
      .replace('{current}', String(values.current ?? ''))
      .replace('{total}', String(values.total ?? ''));
  },
}));

vi.mock('@/lib/support-contacts', () => ({
  getSupportContacts: () => ({
    telHref: 'tel:+38349900600',
    whatsappHref: 'https://wa.me/38349900600',
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/actions/claims', () => ({
  submitClaim: (...args: unknown[]) => mockSubmitClaim(...args),
}));

vi.mock('./wizard-step-category', () => ({
  WizardStepCategory: () => <div data-testid="step-category">Category Step</div>,
}));

vi.mock('./wizard-step-details', () => ({
  WizardStepDetails: () => <div data-testid="step-details">Details Step</div>,
}));

vi.mock('./wizard-step-evidence', () => ({
  WizardStepEvidence: () => <div data-testid="step-evidence">Evidence Step</div>,
}));

vi.mock('./wizard-review', () => ({
  WizardReview: () => <div data-testid="step-review">Review Step</div>,
}));

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@interdomestik/ui/components/progress', () => ({
  Progress: ({ value }: { value: number }) => <div data-testid="progress" data-value={value} />,
}));

vi.mock('@interdomestik/ui/components/form', () => ({
  Form: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ClaimWizard UI V2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_UI_V2 = 'true';
  });

  it('shows a visible inline error when next-step validation fails', async () => {
    mockTrigger.mockResolvedValue(false);

    render(<ClaimWizard />);

    expect(screen.getByTestId('claim-wizard-help')).toBeInTheDocument();
    expect(screen.getByTestId('claim-wizard-help-call')).toHaveAttribute(
      'href',
      'tel:+38349900600'
    );
    fireEvent.click(screen.getByTestId('wizard-next'));

    expect(await screen.findByTestId('wizard-inline-error')).toBeVisible();
    expect(screen.getByTestId('wizard-inline-error')).toHaveTextContent(
      'Please complete required fields'
    );
    expect(screen.getByTestId('claims-wizard-disclaimer')).toBeInTheDocument();
  });

  it('shows claim-created success state with claim id on final submit', async () => {
    mockTrigger.mockResolvedValue(true);
    mockSubmitClaim.mockResolvedValue({ success: true, claimId: 'CLM-TEST-123' });

    render(<ClaimWizard />);

    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => expect(screen.getByText(/Step 3 of 4/)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('wizard-next'));
    await waitFor(() => expect(screen.getByText(/Step 4 of 4/)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('wizard-submit'));

    const success = await screen.findByTestId('claim-created-success');
    expect(success).toBeVisible();
    expect(success).toHaveTextContent('Case created');
    expect(success).toHaveTextContent('CLM-TEST-123');
    expect(screen.getByTestId('claim-created-id')).toHaveTextContent('Case ID');
    expect(screen.getByTestId('claim-created-next-steps')).toBeInTheDocument();
    expect(screen.getByTestId('claim-created-help-call')).toHaveAttribute(
      'href',
      'tel:+38349900600'
    );
    expect(screen.getByTestId('claim-created-help-whatsapp')).toHaveAttribute(
      'href',
      'https://wa.me/38349900600'
    );
    expect(screen.getByTestId('claim-created-go-to-claim')).toHaveAttribute(
      'href',
      '/sq/member/claims/CLM-TEST-123'
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
