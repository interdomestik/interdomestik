import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimTimeline } from './claim-timeline';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      nextSla: `Next action ${params?.target || ''}`,
      atRisk: 'At Risk',
      updatedAt: `Updated: ${params?.date || ''}`,
    };
    return translations[key] || key;
  },
}));

// Mock cn utility
vi.mock('@interdomestik/ui/lib/utils', () => ({
  cn: (...args: (string | undefined | false)[]) => args.filter(Boolean).join(' '),
}));

describe('ClaimTimeline', () => {
  const mockUpdatedAt = new Date('2024-01-15T10:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders timeline phases', () => {
    render(<ClaimTimeline status="submitted" updatedAt={mockUpdatedAt} />);

    // Should show the phase labels
    expect(screen.getByText('Submission')).toBeInTheDocument();
    expect(screen.getByText('Verification')).toBeInTheDocument();
    expect(screen.getByText('Evaluation')).toBeInTheDocument();
    expect(screen.getByText('Negotiation')).toBeInTheDocument();
    expect(screen.getByText('Resolution')).toBeInTheDocument();
  });

  it('shows phase descriptions', () => {
    render(<ClaimTimeline status="verification" updatedAt={mockUpdatedAt} />);

    expect(screen.getByText('Claim received')).toBeInTheDocument();
    expect(screen.getByText('Checking details')).toBeInTheDocument();
  });

  it('shows SLA information', () => {
    render(<ClaimTimeline status="submitted" updatedAt={mockUpdatedAt} />);

    expect(screen.getByText('Next action <24h')).toBeInTheDocument();
  });

  it('handles resolved status', () => {
    render(<ClaimTimeline status="resolved" updatedAt={mockUpdatedAt} />);

    expect(screen.getByText('Resolution')).toBeInTheDocument();
  });

  it('handles rejected status', () => {
    render(<ClaimTimeline status="rejected" updatedAt={mockUpdatedAt} />);

    // Should still render the timeline
    expect(screen.getByText('Resolution')).toBeInTheDocument();
  });

  it('shows at risk warning for stale claims', () => {
    // Create a date more than 48 hours ago
    const oldDate = new Date(Date.now() - 72 * 60 * 60 * 1000);
    render(<ClaimTimeline status="verification" updatedAt={oldDate} />);

    expect(screen.getByText('At Risk')).toBeInTheDocument();
  });
});
