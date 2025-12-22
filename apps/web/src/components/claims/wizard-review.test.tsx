import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WizardReview } from './wizard-review';

// Mock react-hook-form
vi.mock('react-hook-form', () => ({
  useFormContext: () => ({
    getValues: vi.fn().mockReturnValue({
      category: 'vehicle',
      title: 'Car Accident on Highway',
      companyName: 'State Farm',
      claimAmount: '5000',
      currency: 'EUR',
      incidentDate: '2024-01-15',
      description: 'I was rear-ended at a traffic light.',
      files: [{ id: '1', name: 'photo.jpg' }],
    }),
  }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      title: 'Review Your Claim',
      subtitle: 'Please verify all information before submitting',
      summary: 'Claim Summary',
      category: 'Category',
      date: 'Incident Date',
      company: 'Company',
      claim_title: 'Claim Title',
      amount: 'Amount',
      description: 'Description',
      evidence: 'Evidence',
      files_attached: `${params?.count || 0} file(s) attached`,
      privacyBadgeTitle: 'Your Privacy Protected',
      privacyBadge: 'All data is encrypted',
      slaTitle: 'Response Time',
      slaCopy: 'We respond within 24 hours',
      consent: 'By submitting, you agree to our terms',
    };
    return translations[key] || key;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui/components/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@interdomestik/ui/components/separator', () => ({
  Separator: () => <hr />,
}));

describe('WizardReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the review title', () => {
    render(<WizardReview />);
    expect(screen.getByText('Review Your Claim')).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<WizardReview />);
    expect(screen.getByText('Please verify all information before submitting')).toBeInTheDocument();
  });

  it('shows claim summary section', () => {
    render(<WizardReview />);
    expect(screen.getByText('Claim Summary')).toBeInTheDocument();
  });

  it('displays category', () => {
    render(<WizardReview />);
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('vehicle')).toBeInTheDocument();
  });

  it('displays company name', () => {
    render(<WizardReview />);
    expect(screen.getByText('Company')).toBeInTheDocument();
    expect(screen.getByText('State Farm')).toBeInTheDocument();
  });

  it('displays claim title', () => {
    render(<WizardReview />);
    expect(screen.getByText('Claim Title')).toBeInTheDocument();
    expect(screen.getByText('Car Accident on Highway')).toBeInTheDocument();
  });

  it('displays claim amount', () => {
    render(<WizardReview />);
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('5000 EUR')).toBeInTheDocument();
  });

  it('displays description', () => {
    render(<WizardReview />);
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('I was rear-ended at a traffic light.')).toBeInTheDocument();
  });

  it('displays file count', () => {
    render(<WizardReview />);
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.getByText('1 file(s) attached')).toBeInTheDocument();
  });

  it('shows privacy badge', () => {
    render(<WizardReview />);
    expect(screen.getByText('Your Privacy Protected')).toBeInTheDocument();
  });

  it('shows response time info', () => {
    render(<WizardReview />);
    expect(screen.getByText('Response Time')).toBeInTheDocument();
  });

  it('shows consent text', () => {
    render(<WizardReview />);
    expect(screen.getByText('By submitting, you agree to our terms')).toBeInTheDocument();
  });
});
