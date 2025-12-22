import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentStatusSelect } from './agent-status-select';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      submitted: 'Submitted',
      verification: 'Verification',
      evaluation: 'Evaluation',
      negotiation: 'Negotiation',
      court: 'Court',
      resolved: 'Resolved',
      rejected: 'Rejected',
      status_label: 'Status',
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
  updateClaimStatus: vi.fn().mockResolvedValue({}),
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Select: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <div data-testid="select" data-disabled={disabled}>
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

describe('AgentStatusSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders status label', () => {
    render(<AgentStatusSelect claimId="claim-123" currentStatus="submitted" />);
    expect(screen.getByText('Status:')).toBeInTheDocument();
  });

  it('renders select component', () => {
    render(<AgentStatusSelect claimId="claim-123" currentStatus="submitted" />);
    expect(screen.getByTestId('select')).toBeInTheDocument();
  });

  it('renders all status options', () => {
    render(<AgentStatusSelect claimId="claim-123" currentStatus="submitted" />);

    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Verification')).toBeInTheDocument();
    expect(screen.getByText('Evaluation')).toBeInTheDocument();
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
    expect(screen.getByText('Court')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('disables select when disabled prop is true', () => {
    render(<AgentStatusSelect claimId="claim-123" currentStatus="submitted" disabled />);
    expect(screen.getByTestId('select')).toHaveAttribute('data-disabled', 'true');
  });

  it('renders with different status', () => {
    render(<AgentStatusSelect claimId="claim-123" currentStatus="verification" />);
    expect(screen.getByTestId('select')).toBeInTheDocument();
  });
});
