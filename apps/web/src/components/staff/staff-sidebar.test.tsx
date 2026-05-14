import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StaffSidebar } from './staff-sidebar';
import { authClient } from '@/lib/auth-client';
import { signOutAndRedirectToLogin } from '@/lib/auth/logout';

const mockSignOutAndRedirectToLogin = vi.mocked(signOutAndRedirectToLogin);

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  usePathname: () => '/staff/claims',
}));

vi.mock('@/lib/auth/logout', () => ({
  signOutAndRedirectToLogin: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Staff', email: 'staff@example.com', role: 'staff' } },
      isPending: false,
      error: null,
    }),
    signOut: vi.fn(),
  },
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
  useTranslations: () => (key: string) => key,
}));

vi.mock('@interdomestik/ui', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <div />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Sidebar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@interdomestik/ui/components/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: () => <div />,
}));

vi.mock('lucide-react', () => ({
  BarChart3: () => <span />,
  ChevronUp: () => <span />,
  FileText: () => <span />,
  Inbox: () => <span />,
  LogOut: () => <span />,
  Shield: () => <span />,
}));

describe('StaffSidebar', () => {
  it('renders from a provided user without consulting the auth session hook', () => {
    const useSessionSpy = vi.mocked(authClient.useSession);

    render(
      <StaffSidebar
        user={{ name: 'Provided Staff', email: 'provided.staff@example.com', image: null }}
      />
    );

    expect(screen.getByText('Provided Staff')).toBeInTheDocument();
    expect(screen.getByText('provided.staff@example.com')).toBeInTheDocument();
    expect(useSessionSpy).not.toHaveBeenCalled();
  });

  it('does not render a redundant /staff overview link', () => {
    render(<StaffSidebar />);

    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));
    expect(hrefs).toContain('/staff/claims');
    expect(hrefs).toContain('/staff/support-handoffs');
    expect(hrefs).toContain('/staff/crm');
    expect(hrefs).not.toContain('/staff');
  });

  it('renders the staff CRM entry for staff users only', () => {
    const { rerender } = render(<StaffSidebar user={{ name: 'Staff', role: 'staff' }} />);

    expect(screen.getAllByRole('link').map(link => link.getAttribute('href'))).toContain(
      '/staff/crm'
    );

    for (const role of ['branch_manager', 'admin', 'agent', 'member', null, undefined]) {
      rerender(<StaffSidebar user={{ name: 'User', role }} />);

      expect(screen.getAllByRole('link').map(link => link.getAttribute('href'))).not.toContain(
        '/staff/crm'
      );
    }
  });

  it('signs out with a localized hard redirect', async () => {
    render(<StaffSidebar />);

    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    await waitFor(() => {
      expect(mockSignOutAndRedirectToLogin).toHaveBeenCalledWith({
        locale: 'sq',
        signOut: authClient.signOut,
      });
    });
  });
});
