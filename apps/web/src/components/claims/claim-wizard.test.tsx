import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimWizard } from './claim-wizard';

// Mock react-hook-form
vi.mock('react-hook-form', () => {
  const actual = vi.importActual('react-hook-form');
  return {
    ...actual,
    useForm: () => ({
      control: {},
      handleSubmit: (fn: () => void) => (e: React.FormEvent) => {
        e?.preventDefault?.();
        fn();
      },
      trigger: vi.fn().mockResolvedValue(true),
      watch: vi.fn(),
      getValues: vi.fn().mockReturnValue({}),
      formState: { errors: {} },
      reset: vi.fn(),
      register: vi.fn(),
      setValue: vi.fn(),
    }),
    Controller: ({
      render: r,
    }: {
      render: (props: { field: { onChange: () => void; value: string } }) => React.ReactNode;
    }) => r({ field: { onChange: vi.fn(), value: '' } }),
    useWatch: vi.fn().mockReturnValue({}),
    useFormContext: () => ({
      control: {},
      watch: vi.fn(),
      getValues: vi.fn().mockReturnValue({}),
      formState: { errors: {} },
      register: vi.fn(),
      setValue: vi.fn(),
    }),
    FormProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// Mock zod resolver
vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => () => ({ values: {}, errors: {} }),
}));

// Mock router
const mockPush = vi.fn();
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock next-intl
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

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock submitClaim action
vi.mock('@/actions/claims', () => ({
  submitClaim: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock wizard step components
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

// Mock UI components from interdomestik/ui
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

describe('ClaimWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the wizard with progress bar', () => {
    render(<ClaimWizard />);

    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
  });

  it('starts at category step by default', () => {
    render(<ClaimWizard />);

    expect(screen.getByTestId('step-category')).toBeInTheDocument();
    expect(screen.queryByTestId('step-details')).not.toBeInTheDocument();
  });

  it('renders next button on first step', () => {
    render(<ClaimWizard />);

    expect(screen.getByTestId('wizard-next')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('starts at details step when initial category provided', () => {
    render(<ClaimWizard initialCategory="auto" />);

    expect(screen.getByTestId('step-details')).toBeInTheDocument();
    expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument();
  });

  it('has back button with invisible class on first step', () => {
    render(<ClaimWizard />);

    const backButton = screen.getByTestId('wizard-back');
    expect(backButton).toHaveClass('invisible');
  });

  it('displays step titles in progress', () => {
    render(<ClaimWizard />);

    expect(screen.getByText('Category')).toBeInTheDocument();
  });
});
