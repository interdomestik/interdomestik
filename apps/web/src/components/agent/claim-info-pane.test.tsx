import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimInfoPane } from './claim-info-pane';

// Mock AgentStatusSelect
vi.mock('@/components/agent/agent-status-select', () => ({
  AgentStatusSelect: ({
    claimId,
    currentStatus,
    disabled,
  }: {
    claimId: string;
    currentStatus: string;
    disabled?: boolean;
  }) => (
    <div
      data-testid="status-select"
      data-claim-id={claimId}
      data-status={currentStatus}
      data-disabled={disabled}
    >
      Status: {currentStatus}
    </div>
  ),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'details.title': 'Claim Details',
      'details.company': 'Company',
      'details.amount': 'Amount',
      'details.incident_date': 'Incident Date',
      'details.status_label': 'Status',
      'details.description': 'Description',
    };
    return translations[key] || key;
  },
}));

// Mock date-fns
vi.mock('date-fns', () => ({
  format: (date: Date) => date.toLocaleDateString(),
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: () => null,
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => <hr />,
}));

const mockClaim = {
  id: 'claim-123',
  title: 'Car Accident Claim',
  description: 'I was rear-ended at a traffic light on Main Street.',
  status: 'verification',
  companyName: 'State Farm',
  claimAmount: '5000',
  currency: 'EUR',
  incidentDate: '2024-01-15',
  user: {
    name: 'John Doe',
    email: 'john@example.com',
    image: null,
  },
};

describe('ClaimInfoPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the claim details title', () => {
    render(<ClaimInfoPane claim={mockClaim} />);
    expect(screen.getByText('Claim Details')).toBeInTheDocument();
  });

  it('displays claimant name', () => {
    render(<ClaimInfoPane claim={mockClaim} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('displays claimant email', () => {
    render(<ClaimInfoPane claim={mockClaim} />);
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });

  it('displays company name', () => {
    render(<ClaimInfoPane claim={mockClaim} />);
    expect(screen.getByText('Company')).toBeInTheDocument();
    expect(screen.getByText('State Farm')).toBeInTheDocument();
  });

  it('displays claim amount', () => {
    render(<ClaimInfoPane claim={mockClaim} />);
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('5000 EUR')).toBeInTheDocument();
  });

  it('displays status section', () => {
    render(<ClaimInfoPane claim={mockClaim} />);
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByTestId('status-select')).toBeInTheDocument();
  });

  it('displays description', () => {
    render(<ClaimInfoPane claim={mockClaim} />);
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(
      screen.getByText('I was rear-ended at a traffic light on Main Street.')
    ).toBeInTheDocument();
  });

  it('disables status select when readOnly', () => {
    render(<ClaimInfoPane claim={mockClaim} readOnly />);
    expect(screen.getByTestId('status-select')).toHaveAttribute('data-disabled', 'true');
  });

  it('shows user initials in avatar fallback', () => {
    render(<ClaimInfoPane claim={mockClaim} />);
    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('handles missing user gracefully', () => {
    const claimWithoutUser = { ...mockClaim, user: null };
    render(<ClaimInfoPane claim={claimWithoutUser} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
