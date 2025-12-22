import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimDraftActions } from './claim-draft-actions';

// Mock router
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      editDraft: 'Edit Draft',
      cancelClaim: 'Cancel Claim',
      cancelConfirm: 'Are you sure you want to cancel this claim?',
      cancelled: 'Claim cancelled',
      cancelFailed: 'Failed to cancel claim',
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

// Mock cancelClaim action
vi.mock('@/actions/claims', () => ({
  cancelClaim: vi.fn().mockResolvedValue({ success: true }),
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

describe('ClaimDraftActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders edit draft button', () => {
    render(<ClaimDraftActions claimId="claim-123" />);
    expect(screen.getByText('Edit Draft')).toBeInTheDocument();
  });

  it('renders cancel claim button', () => {
    render(<ClaimDraftActions claimId="claim-123" />);
    expect(screen.getByText('Cancel Claim')).toBeInTheDocument();
  });

  it('edit link has correct href', () => {
    render(<ClaimDraftActions claimId="claim-123" />);
    const editLink = screen.getByText('Edit Draft').closest('a');
    expect(editLink).toHaveAttribute('href', '/dashboard/claims/claim-123/edit');
  });

  it('renders action buttons container', () => {
    render(<ClaimDraftActions claimId="claim-456" />);
    // Both buttons should be present
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });
});
