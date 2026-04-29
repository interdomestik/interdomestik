// v2.0.0-ops — Admin Claims lifecycle hardening
import type { ClaimsListV2Dto } from '@/server/domains/claims/types';
import { render, screen } from '@testing-library/react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

type MockLinkProps = {
  children: ReactNode;
  href: string;
};

type MockChildrenProps = {
  children?: ReactNode;
};

type MockButtonProps = ComponentPropsWithoutRef<'button'> & {
  asChild?: boolean;
  variant?: string;
  size?: string;
};

type MockTranslationParams = Record<string, string | number>;

// Mock routing to avoid next-intl module resolution issues
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: MockLinkProps) => <a href={href}>{children}</a>,
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

import { ClaimsList } from './claims-list';

// Mock child components
vi.mock('@interdomestik/ui', () => ({
  Badge: ({ children, className }: ComponentPropsWithoutRef<'div'>) => (
    <div data-testid="badge" className={className}>
      {children}
    </div>
  ),
  Button: ({
    children,
    asChild: _asChild,
    variant: _variant,
    size: _size,
    ...props
  }: MockButtonProps) => <button {...props}>{children}</button>,
  Card: ({ children, className }: ComponentPropsWithoutRef<'div'>) => (
    <div className={className}>{children}</div>
  ),
  Table: ({ children }: MockChildrenProps) => <table>{children}</table>,
  TableBody: ({ children }: MockChildrenProps) => <tbody>{children}</tbody>,
  TableCell: ({ children, className, ...props }: ComponentPropsWithoutRef<'td'>) => (
    <td className={className} {...props}>
      {children}
    </td>
  ),
  TableHead: ({ children, ...props }: ComponentPropsWithoutRef<'th'>) => (
    <th {...props}>{children}</th>
  ),
  TableHeader: ({ children }: MockChildrenProps) => <thead>{children}</thead>,
  TableRow: ({ children, className, ...props }: ComponentPropsWithoutRef<'tr'>) => (
    <tr className={className} {...props}>
      {children}
    </tr>
  ),
}));

// Mock icons
vi.mock('lucide-react', () => ({
  AlertTriangle: () => <span data-testid="alert-icon" />,
  Eye: () => <span data-testid="eye-icon" />,
}));

// Mock translations
vi.mock('next-intl', () => ({
  useTranslations: (_namespace: string) => (key: string, params?: MockTranslationParams) => {
    // Return key for simple assertions, or interpolated string for params
    if (params) {
      if (key === 'group_header') return `${params.label} • ${params.count}`;
      if (key === 'row.stage_line') return `Stage: ${params.stage} • ${params.days} days`;
      if (key === 'row.owner_waiting') return `Waiting on ${params.owner}`;
      if (key === 'row.owner_assigned') return `Assigned: ${params.name} (${params.role})`;
      if (key === 'row.branch_type') return `${params.branch} • ${params.type}`;
      if (key === 'row.member') return `Member: ${params.name} (${params.email})`;
      return `${key}:${JSON.stringify(params)}`;
    }
    // Return mock values for known namespaces/keys
    const mocks: Record<string, string> = {
      'groups.submitted': 'Submitted',
      'groups.verification': 'Verification',
      'groups.evaluation': 'Evaluation',
      'groups.negotiation': 'Negotiation',
      'groups.court': 'Court',
      'groups.resolved': 'Resolved',
      'groups.rejected': 'Rejected',
      'groups.draft': 'Draft',
      'groups.other': 'Other',
      submitted: 'Submitted',
      verification: 'Verification',
      evaluation: 'Evaluation',
      negotiation: 'Negotiation',
      court: 'Court',
      resolved: 'Resolved',
      rejected: 'Rejected',
      draft: 'Draft',
      staff: 'Staff',
      member: 'Member',
      agent: 'Agent',
      admin: 'Admin',
      system: 'System',
      unknown: 'Unknown',
      consumer: 'Consumer',
      staff_genitive: 'Staff',
      member_genitive: 'Member',
      agent_genitive: 'Agent',
      admin_genitive: 'Admin',
      system_genitive: 'System',
      unknown_genitive: 'Unknown',
      'row.owner_system': 'System queue',
      'row.stuck': 'Stuck',
      'headers.title': 'Title',
      'headers.actions': 'Actions',
      next: 'Next',
      previous: 'Previous',
      view: 'View',
      no_results: 'No results',
    };
    return mocks[key] || key;
  },
}));

describe('ClaimsList', () => {
  const mockData: ClaimsListV2Dto = {
    rows: [
      {
        id: '1',
        claimNumber: 'CLM-1',
        title: 'Claim 1',
        status: 'submitted',
        statusLabelKey: 'submitted',
        amount: '1000.00',
        currency: 'EUR',
        currentStage: 'submitted',
        currentOwnerRole: 'staff',
        isStuck: false,
        daysInCurrentStage: 2,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-02T10:00:00Z'),
        unreadCount: 0,
        claimantName: 'John Doe',
        claimantEmail: 'john@example.com',
        branchId: 'branch-1',
        branchName: 'Main Branch',
        branchCode: 'MB',
        category: 'consumer',
        staffName: 'Staff Member',
        staffEmail: 'staff@example.com',
        assignedAt: new Date('2024-01-01T12:00:00Z'),
      },
    ],
    pagination: {
      page: 1,
      totalPages: 5,
      perPage: 20,
      totalCount: 100,
    },
    totals: {
      active: 10,
      draft: 2,
      closed: 5,
    },
  };

  it('renders claims table with data', async () => {
    render(<ClaimsList data={mockData} />);
    expect(screen.getByText('Claim 1')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    // Component uses branchCode (MB) and category translation (consumer -> Consumer)
    expect(screen.getByText('MB • Consumer')).toBeInTheDocument();
  });

  it('renders group headers correctly', async () => {
    // The component groups by status. Mock status is 'submitted'.
    render(<ClaimsList data={mockData} />);
    expect(screen.getByText('Submitted • 1')).toBeInTheDocument();
  });

  it('renders no claims message for empty array', () => {
    render(<ClaimsList data={{ ...mockData, rows: [] }} />);
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('renders pagination controls', () => {
    render(<ClaimsList data={mockData} />);
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('displays stuck status warning', async () => {
    const stuckData = {
      ...mockData,
      rows: [
        {
          ...mockData.rows[0],
          isStuck: true,
        },
      ],
    };
    render(<ClaimsList data={stuckData} />);
    expect(screen.getByText('Stuck')).toBeInTheDocument();
  });

  it('displays claimant information', async () => {
    render(<ClaimsList data={mockData} />);
    expect(screen.getByText('Member: John Doe (john@example.com)')).toBeInTheDocument();
  });
});
