import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClaimStatusBadge } from './claim-status-badge';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, opts?: { defaultValue?: string }) => {
    const translations: Record<string, string> = {
      draft: 'Draft',
      submitted: 'Submitted',
      verification: 'Verification',
      evaluation: 'Evaluation',
      processing: 'Processing',
      negotiation: 'Negotiation',
      court: 'Court',
      resolved: 'Resolved',
      rejected: 'Rejected',
      unknown: opts?.defaultValue || 'Unknown',
    };
    return translations[key] || key;
  },
}));

describe('ClaimStatusBadge', () => {
  it('renders submitted status', () => {
    render(<ClaimStatusBadge status="submitted" />);
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  it('renders draft status', () => {
    render(<ClaimStatusBadge status="draft" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders verification status', () => {
    render(<ClaimStatusBadge status="verification" />);
    expect(screen.getByText('Verification')).toBeInTheDocument();
  });

  it('renders resolved status', () => {
    render(<ClaimStatusBadge status="resolved" />);
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  it('renders rejected status', () => {
    render(<ClaimStatusBadge status="rejected" />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('renders unknown for null status', () => {
    render(<ClaimStatusBadge status={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders unknown status key for undefined status', () => {
    render(<ClaimStatusBadge status={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
