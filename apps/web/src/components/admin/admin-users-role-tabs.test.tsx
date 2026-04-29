import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersRoleTabs } from './admin-users-role-tabs';

const { searchParamsMock, pathnameMock } = vi.hoisted(() => ({
  searchParamsMock: vi.fn(() => new URLSearchParams()),
  pathnameMock: vi.fn(() => '/admin/users'),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => pathnameMock(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      processing: 'Processing...',
    };
    return translations[key] || key;
  },
}));

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    children: React.ReactNode;
  }) => {
    if (asChild) return <>{children}</>;
    return <button {...props}>{children}</button>;
  },
}));

const options = [
  { value: 'user', label: 'Members', href: '/admin/users?tenantId=tenant_ks' },
  { value: 'agent', label: 'Agents', href: '/admin/users?tenantId=tenant_ks&role=agent' },
  {
    value: 'admin,staff',
    label: 'Staff / Admins',
    href: '/admin/users?tenantId=tenant_ks&role=admin%2Cstaff',
  },
];

describe('AdminUsersRoleTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathnameMock.mockReturnValue('/admin/users');
    searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks'));
  });

  it('keeps the active role tab inert', () => {
    render(<AdminUsersRoleTabs selectedRole="user" options={options} />);

    expect(screen.getByRole('button', { name: 'Members' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Agents' })).toHaveAttribute(
      'href',
      '/admin/users?tenantId=tenant_ks&role=agent'
    );
  });

  it('shows pending feedback and makes inactive role links inert after a transition starts', () => {
    const sameDocumentOptions = options.map(option => ({ ...option, href: `#${option.value}` }));
    render(<AdminUsersRoleTabs selectedRole="user" options={sameDocumentOptions} />);

    fireEvent.click(screen.getByRole('link', { name: 'Agents' }));

    expect(screen.getByTestId('admin-users-role-tabs')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('admin-users-role-tabs-pending')).toHaveTextContent('Processing...');
    expect(screen.getByRole('link', { name: 'Agents' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: 'Staff / Admins' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
