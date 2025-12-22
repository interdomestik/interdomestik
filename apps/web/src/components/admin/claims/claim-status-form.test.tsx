import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimStatusForm } from './claim-status-form';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      draft: 'Draft',
      submitted: 'Submitted',
      verification: 'Verification',
      evaluation: 'Evaluation',
      negotiation: 'Negotiation',
      court: 'Court',
      resolved: 'Resolved',
      rejected: 'Rejected',
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
vi.mock('@/actions/admin-claims', () => ({
  updateClaimStatus: vi.fn().mockResolvedValue({}),
}));

// Mock UI components
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

describe('ClaimStatusForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders select component', () => {
    render(<ClaimStatusForm claimId="claim-123" currentStatus="submitted" locale="en" />);
    expect(screen.getByTestId('select')).toBeInTheDocument();
  });

  it('renders all status options', () => {
    render(<ClaimStatusForm claimId="claim-123" currentStatus="submitted" locale="en" />);

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Verification')).toBeInTheDocument();
    expect(screen.getByText('Evaluation')).toBeInTheDocument();
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
    expect(screen.getByText('Court')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('sets current status value', () => {
    render(<ClaimStatusForm claimId="claim-123" currentStatus="verification" locale="en" />);
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'verification');
  });

  it('renders with different status', () => {
    render(<ClaimStatusForm claimId="claim-123" currentStatus="resolved" locale="en" />);
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'resolved');
  });
});
