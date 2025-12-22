import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimAssignmentForm } from './claim-assignment-form';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      processing: 'Processing...',
      'errors.generic': 'An error occurred',
      'assignment.placeholder': 'Select staff member',
      'assignment.unassigned': 'Unassigned',
      'assignment.success_message': 'Claim assigned successfully',
    };
    return translations[key] || key;
  },
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock action
vi.mock('@/actions/agent-claims', () => ({
  assignClaim: vi.fn().mockResolvedValue({}),
}));

// Mock UI components
vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@interdomestik/ui/components/select', () => ({
  Select: ({ children, value }: { children: React.ReactNode; value?: string }) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

const mockStaff = [
  { id: 'staff-1', name: 'John Staff', email: 'john@example.com' },
  { id: 'staff-2', name: 'Jane Staff', email: 'jane@example.com' },
];

describe('ClaimAssignmentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders select component', () => {
    render(<ClaimAssignmentForm claimId="claim-123" currentStaffId={null} staff={mockStaff} />);
    expect(screen.getByTestId('select')).toBeInTheDocument();
  });

  it('renders unassigned option', () => {
    render(<ClaimAssignmentForm claimId="claim-123" currentStaffId={null} staff={mockStaff} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('renders staff options', () => {
    render(<ClaimAssignmentForm claimId="claim-123" currentStaffId={null} staff={mockStaff} />);
    expect(screen.getByText('John Staff')).toBeInTheDocument();
    expect(screen.getByText('Jane Staff')).toBeInTheDocument();
  });

  it('sets value to unassigned when no current staff', () => {
    render(<ClaimAssignmentForm claimId="claim-123" currentStaffId={null} staff={mockStaff} />);
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'unassigned');
  });

  it('sets value to current staff id when provided', () => {
    render(<ClaimAssignmentForm claimId="claim-123" currentStaffId="staff-1" staff={mockStaff} />);
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'staff-1');
  });
});
