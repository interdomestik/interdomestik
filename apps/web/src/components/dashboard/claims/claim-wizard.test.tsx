import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimWizard } from './claim-wizard';

// Mock router
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock react-hook-form
vi.mock('react-hook-form', () => ({
  useForm: () => ({
    register: () => ({}),
    formState: { errors: {} },
    watch: () => ({
      title: '',
      category: '',
      companyName: '',
      description: '',
      claimAmount: '',
      currency: 'EUR',
    }),
    setValue: vi.fn(),
    trigger: vi.fn().mockResolvedValue(true),
    handleSubmit: (fn: () => void) => (e: Event) => {
      e?.preventDefault?.();
      fn();
    },
  }),
}));

// Mock zod resolver
vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => vi.fn(),
}));

// Mock submit action
vi.mock('@/actions/claims', () => ({
  submitClaim: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  Progress: ({ value }: { value: number }) => <div data-testid="progress" data-value={value} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

describe('ClaimWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders step progress indicator', () => {
    render(<ClaimWizard />);
    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
  });

  it('renders progress bar', () => {
    render(<ClaimWizard />);
    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('renders step badge', () => {
    render(<ClaimWizard />);
    // The current step badge shows the step name - may appear multiple times
    const badges = screen.getAllByText('Basic Info');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('renders first step content', () => {
    render(<ClaimWizard />);
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
    expect(screen.getByText('Complaint Title *')).toBeInTheDocument();
    expect(screen.getByText('Detailed Description *')).toBeInTheDocument();
  });

  it('renders navigation buttons', () => {
    render(<ClaimWizard />);
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('disables Previous button on first step', () => {
    render(<ClaimWizard />);
    const prevButton = screen.getByText('Previous').closest('button');
    expect(prevButton).toBeDisabled();
  });

  it('renders title input placeholder', () => {
    render(<ClaimWizard />);
    expect(screen.getByPlaceholderText('e.g., Defective product not refunded')).toBeInTheDocument();
  });
});
