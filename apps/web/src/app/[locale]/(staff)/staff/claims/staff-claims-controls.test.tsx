import { fireEvent, render, screen } from '@testing-library/react';
import type { MouseEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StaffClaimsControls } from './staff-claims-controls';

const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    onClick,
    prefetch: _prefetch,
    ...props
  }: {
    children: ReactNode;
    href: string;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
    prefetch?: boolean;
  }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: routerPushMock,
  }),
}));

function renderControls(overrides: Partial<Parameters<typeof StaffClaimsControls>[0]> = {}) {
  const props: Parameters<typeof StaffClaimsControls>[0] = {
    assignmentFilterLabel: 'Assignment filter',
    assignmentOptions: [
      {
        href: '/staff/claims?status=verification&search=Acme',
        isActive: false,
        label: 'All branch claims',
        testId: 'staff-claims-assigned-filter-all',
        value: 'all',
      },
      {
        href: '/staff/claims?assigned=unassigned&status=verification&search=Acme',
        isActive: true,
        label: 'Unassigned',
        testId: 'staff-claims-assigned-filter-unassigned',
        value: 'unassigned',
      },
    ],
    clearSearchHref: '/staff/claims?assigned=unassigned&status=verification&diaspora=diaspora',
    clearSearchLabel: 'Clear',
    currentSearch: 'Acme',
    diasporaFilterLabel: 'Origin filter',
    diasporaOptions: [
      {
        href: '/staff/claims?assigned=unassigned&status=verification&search=Acme',
        isActive: false,
        label: 'All origins',
        testId: 'staff-claims-diaspora-filter-all',
        value: 'all',
      },
      {
        href: '/staff/claims?assigned=unassigned&status=verification&diaspora=diaspora&search=Acme',
        isActive: true,
        label: 'Diaspora / Green Card',
        testId: 'staff-claims-diaspora-filter-diaspora',
        value: 'diaspora',
      },
    ],
    formAction: '/en/staff/claims',
    hiddenFields: [
      { name: 'assigned', value: 'unassigned' },
      { name: 'status', value: 'verification' },
      { name: 'diaspora', value: 'diaspora' },
    ],
    pendingFilterLabel: 'Updating filters...',
    pendingSearchLabel: 'Searching claims...',
    searchLabel: 'Search',
    searchPlaceholder: 'Search claim, member, company, or number',
    statusFilterLabel: 'Status filter',
    statusOptions: [
      {
        href: '/staff/claims?assigned=unassigned&diaspora=diaspora&search=Acme',
        isActive: false,
        label: 'All actionable',
        testId: 'staff-claims-status-filter-all',
        value: 'all',
      },
      {
        href: '/staff/claims?assigned=unassigned&status=verification&diaspora=diaspora&search=Acme',
        isActive: true,
        label: 'Verification',
        testId: 'staff-claims-status-filter-verification',
        value: 'verification',
      },
    ],
    ...overrides,
  };

  return render(<StaffClaimsControls {...props} />);
}

describe('StaffClaimsControls', () => {
  beforeEach(() => {
    routerPushMock.mockClear();
  });

  it('submits trimmed search while preserving active staff claim filters', () => {
    renderControls();

    fireEvent.change(screen.getByTestId('staff-claims-search-input'), {
      target: { value: '  Claim 42  ' },
    });
    fireEvent.submit(screen.getByTestId('staff-claims-search-form'));

    expect(routerPushMock).toHaveBeenCalledWith(
      '/staff/claims?assigned=unassigned&status=verification&diaspora=diaspora&search=Claim+42'
    );
    expect(screen.getByTestId('staff-claims-pending')).toHaveTextContent('Searching claims...');
  });

  it('omits blank search without dropping other active filters', () => {
    renderControls({ currentSearch: '' });

    fireEvent.change(screen.getByTestId('staff-claims-search-input'), {
      target: { value: '   ' },
    });
    fireEvent.submit(screen.getByTestId('staff-claims-search-form'));

    expect(routerPushMock).toHaveBeenCalledWith(
      '/staff/claims?assigned=unassigned&status=verification&diaspora=diaspora'
    );
  });

  it('navigates filter clicks through the client pending contract', () => {
    renderControls();

    fireEvent.click(screen.getByTestId('staff-claims-status-filter-all'));

    expect(routerPushMock).toHaveBeenCalledWith(
      '/staff/claims?assigned=unassigned&diaspora=diaspora&search=Acme'
    );
    expect(screen.getByTestId('staff-claims-pending')).toHaveTextContent('Updating filters...');
  });

  it('keeps active filter links inert to avoid redundant pending states', () => {
    renderControls();

    fireEvent.click(screen.getByTestId('staff-claims-status-filter-verification'));

    expect(routerPushMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('staff-claims-pending')).not.toBeInTheDocument();
  });
});
