import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimInfoPane } from './claim-info-pane';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const translations: Record<string, string> = {
      'details.title': 'Claim Details',
      'details.company': 'Company',
      'details.amount': 'Amount',
      'details.incident_date': 'Incident Date',
      'details.status_label': 'Status',
      'details.sla_status_label': 'SLA Status',
      'details.sla_phase.running': 'Running',
      'details.sla_phase.incomplete': 'Waiting for member information',
      'details.sla_phase.not_applicable': 'Not active',
      'details.description': 'Description',
      verification: 'Verification',
      submitted: 'Submitted',
    };
    return Object.assign((key: string) => translations[key] || key, {
      has: (key: string) => Object.hasOwn(translations, key),
    });
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

  it.each([
    ['company name', 'Company', 'State Farm'],
    ['claim amount', 'Amount', '5000 EUR'],
    ['status section', 'Status', 'Verification'],
    ['description', 'Description', 'I was rear-ended at a traffic light on Main Street.'],
  ])('displays %s', (_field, label, value) => {
    render(<ClaimInfoPane claim={mockClaim} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(value)).toBeInTheDocument();
  });

  it('renders the localized status as read-only text', () => {
    render(<ClaimInfoPane claim={{ ...mockClaim, status: null }} />);
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('falls back to the submitted label for a status without a catalogue entry', () => {
    render(<ClaimInfoPane claim={{ ...mockClaim, status: 'not_a_status' }} />);
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.queryByText('not_a_status')).not.toBeInTheDocument();
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

  it('displays the staff-facing SLA phase when provided', () => {
    render(<ClaimInfoPane claim={mockClaim} slaPhase="incomplete" />);
    expect(screen.getByText('SLA Status')).toBeInTheDocument();
    expect(screen.getByText('Waiting for member information')).toBeInTheDocument();
  });
});
