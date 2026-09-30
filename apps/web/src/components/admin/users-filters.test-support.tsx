import { render as renderView } from '@testing-library/react';
import { vi } from 'vitest';
import { AdminUsersSearchProvider } from './admin-users-search-provider';

const { pushMock, searchParamsMock, pathnameMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
  pathnameMock: vi.fn(() => '/admin/users'),
}));

// Mock router
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => pathnameMock(),
  useRouter: () => ({
    push: pushMock,
  }),
}));

// Mock navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      search: 'Search',
      search_placeholder: 'Search users...',
      'roles.all': 'All Roles',
      'roles.user': 'Members',
      'roles.agent': 'Agents',
      'roles.staff': 'Staff',
      'roles.admin': 'Admins',
      'assignments.all': 'All',
      'assignments.assigned': 'Assigned',
      'assignments.unassigned': 'Company-owned',
      'labels.role': 'Role',
      'labels.assignment': 'Assignment',
      processing: 'Processing...',
    };
    return translations[key] || key;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  badgeVariants: () => 'badge',
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

export function render(ui: React.ReactNode) {
  return renderView(<AdminUsersSearchProvider>{ui}</AdminUsersSearchProvider>);
}

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...props}>{children}</button>,
}));

export { pushMock, searchParamsMock, pathnameMock };
