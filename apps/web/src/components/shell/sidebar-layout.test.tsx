import { render, screen } from '@testing-library/react';
import { Sidebar, SidebarProvider } from '@interdomestik/ui';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarUserMenu } from '@/components/dashboard/sidebar-user-menu';
import { StaffSidebarBrand } from '@/components/staff/staff-sidebar';
import { buildStaffNavigation } from '@/components/staff/staff-navigation';
import { ShellNavigation } from './shell-navigation';

vi.mock('@interdomestik/ui/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: vi.fn() } }));
vi.mock('@/lib/auth/logout', () => ({ signOutAndRedirectToLogin: vi.fn() }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
  usePathname: () => '/staff/claims',
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('sidebar layout', () => {
  it.each([true, false])('preserves account and brand space with expanded=%s', expanded => {
    render(
      <SidebarProvider defaultOpen={expanded}>
        <Sidebar collapsible="icon">
          <StaffSidebarBrand />
          <SidebarUserMenu user={{ name: 'Staff user', role: 'staff' }} />
        </Sidebar>
      </SidebarProvider>
    );
    const account = screen.getByTestId('sidebar-user-menu-button');
    expect(account).toHaveAccessibleName('Staff user');
    expect(account).toHaveClass('group-data-[state=collapsed]:mx-auto');
    expect(account.querySelector('[data-slot=avatar]') ?? account.firstElementChild).toHaveClass(
      'shrink-0'
    );
    expect(account.querySelector('.grid')).toHaveClass('group-data-[state=collapsed]:hidden');
    expect(account.querySelector('svg')).toHaveClass('group-data-[state=collapsed]:hidden');
    const brand = screen.getByRole('link', { name: 'staffPortal' });
    expect(brand.firstElementChild).toHaveClass('size-8', 'shrink-0');
    expect(brand.querySelector('.grid')).toHaveClass('group-data-[state=collapsed]:hidden');
  });

  it('wraps expanded navigation labels and keeps distinct staff icons', () => {
    const items = buildStaffNavigation({
      role: 'staff',
      tNav: key => key,
      tClaims: () => 'Kërkesat për Dëmshpërblim të anëtarëve',
    });
    expect(new Set(items.map(item => item.icon)).size).toBe(items.length);
    render(
      <SidebarProvider>
        <ShellNavigation label="Menu" pathname="/staff/claims" groups={[{ id: 'staff', items }]} />
      </SidebarProvider>
    );
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveClass(
        'h-auto',
        '[&>span:last-child]:whitespace-normal',
        '[&>span:last-child]:overflow-visible'
      );
      expect(link.querySelector('span')).not.toHaveClass('truncate');
      expect(link.querySelector('span')).toHaveClass('leading-5');
    }
  });
});
