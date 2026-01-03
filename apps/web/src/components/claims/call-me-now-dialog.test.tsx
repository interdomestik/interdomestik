import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallMeNowDialog } from './call-me-now-dialog';

// Mock react-hook-form
vi.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    handleSubmit: (fn: () => void) => (e: Event) => {
      e?.preventDefault?.();
      fn();
    },
    formState: { isSubmitting: false },
    getValues: () => ({ name: '', phone: '' }),
    reset: vi.fn(),
  }),
}));

// Mock zod resolver
vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => vi.fn(),
}));

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  analytics: { track: vi.fn() },
}));

// Mock leads action
vi.mock('@/actions/leads', () => ({
  submitLead: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('tenantId=tenant_mk'),
}));

// Mock UI components
vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <button {...props}>{children}</button>,
}));

vi.mock('@interdomestik/ui/components/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-trigger">{children}</div>
  ),
}));

vi.mock('@interdomestik/ui/components/form', () => ({
  Form: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormControl: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormField: ({
    render,
  }: {
    render: (props: { field: Record<string, unknown> }) => React.ReactNode;
  }) => render({ field: { value: '', onChange: vi.fn() } }),
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  FormMessage: () => null,
}));

vi.mock('@interdomestik/ui/components/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('CallMeNowDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trigger button', () => {
    render(<CallMeNowDialog category="vehicle" />);
    expect(screen.getByText('Request Immediate Callback')).toBeInTheDocument();
  });

  it('renders dialog content', () => {
    render(<CallMeNowDialog category="vehicle" />);
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
  });

  it('renders dialog title', () => {
    render(<CallMeNowDialog category="vehicle" />);
    expect(screen.getByText('Talk to an Expert Now')).toBeInTheDocument();
  });

  it('renders name field', () => {
    render(<CallMeNowDialog category="vehicle" />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('renders phone field', () => {
    render(<CallMeNowDialog category="vehicle" />);
    expect(screen.getByText('Phone Number')).toBeInTheDocument();
  });

  it('renders submit button', () => {
    render(<CallMeNowDialog category="vehicle" />);
    expect(screen.getByText('Call Me Now')).toBeInTheDocument();
  });

  it('displays category in dialog description', () => {
    render(<CallMeNowDialog category="travel" />);
    expect(screen.getByText(/travel case/i)).toBeInTheDocument();
  });
});
