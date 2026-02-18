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
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      step1: 'Category',
      step2: 'Details',
      step3: 'Evidence',
      step4: 'Review',
      submitClaim: 'Submit Claim',
      back: 'Back',
      next: 'Next',
      processing: 'Processing...',
    };
    return translations[key] || key;
  },
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

    fireEvent.click(screen.getByTestId('wizard-next'));

    expect(await screen.findByTestId('wizard-inline-error')).toBeVisible();
    expect(screen.getByTestId('wizard-inline-error')).toHaveTextContent(
      'Please complete required fields'
    );
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
    expect(success).toHaveTextContent('Claim created');
    expect(success).toHaveTextContent('CLM-TEST-123');
    expect(screen.getByTestId('claim-created-go-to-claim')).toHaveAttribute(
      'href',
      '/member/claims/CLM-TEST-123'
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
