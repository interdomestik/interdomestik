import { getSidebarTestState } from './admin-sidebar-test-mocks';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminSidebar } from './admin-sidebar';
import { AdminRoleShell } from '@/components/shell/admin-role-shell';

const hoisted = getSidebarTestState();

describe('AdminSidebar', () => {
  it.each(['staff', 'agent'])(
    'renders every people link and Analytics for %s with effective admin capabilities',
    role => {
      render(
        <AdminSidebar
          user={{
            role,
            name: 'Granted User',
            email: 'granted@example.com',
            capabilities: { canAccessUsers: true, canReadAnalytics: true },
          }}
        />
      );
      for (const name of ['Members', 'Agents', 'Staff', 'Analytics']) {
        expect(screen.getByRole('link', { name })).toBeInTheDocument();
      }
      expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    }
  );

  it('renders user information', () => {
    render(
      <AdminSidebar
        user={{
          capabilities: { canAccessUsers: true, canReadAnalytics: true },
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
        }}
      />
    );

    expect(screen.getByRole('button', { name: /Admin User/ })).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });

  it.each([
    ['admin', '/admin/account'],
    ['tenant_admin', '/admin/account'],
    ['super_admin', '/admin/account'],
    ['branch_manager', '/staff/settings'],
  ])('links %s to its own profile page from the account menu', (role, href) => {
    render(
      <AdminSidebar
        user={{
          capabilities: { canAccessUsers: true, canReadAnalytics: true },
          name: 'Account User',
          email: 'a@example.com',
          role,
        }}
      />
    );

    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', href);
  });

  it('localizes the sidebar account role label', () => {
    render(
      <AdminSidebar
        user={{
          capabilities: { canAccessUsers: true, canReadAnalytics: true },
          name: 'Tenant Admin',
          email: 'tenant-admin@example.com',
          role: 'tenant_admin',
        }}
      />
    );

    expect(screen.getByText('Tenant administrator')).toBeInTheDocument();
    expect(screen.queryByText('tenant_admin')).not.toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(
      <AdminSidebar
        user={{
          capabilities: { canAccessUsers: true, canReadAnalytics: true },
          name: 'Admin',
          email: 'admin@test.com',
          role: 'admin',
        }}
      />
    );

    // Check that sidebar navigation items are rendered
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Claims')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('CRM Reporting')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('renders the CRM reporting link for branch managers only with branch scope', () => {
    const { rerender } = render(
      <AdminSidebar
        user={{
          capabilities: { canAccessUsers: true, canReadAnalytics: true },
          branchId: 'branch-1',
          name: 'Branch Manager',
          email: 'manager@test.com',
          role: 'branch_manager',
        }}
      />
    );

    expect(screen.getByRole('link', { name: 'CRM Reporting' })).toHaveAttribute(
      'href',
      '/admin/crm'
    );

    rerender(
      <AdminSidebar
        user={{
          capabilities: { canAccessUsers: true, canReadAnalytics: true },
          branchId: null,
          name: 'Branch Manager',
          email: 'manager@test.com',
          role: 'branch_manager',
        }}
      />
    );

    expect(screen.queryByRole('link', { name: 'CRM Reporting' })).not.toBeInTheDocument();
  });

  it('only preserves tenant context in sidebar links', () => {
    hoisted.searchParamsMock.mockReturnValue(
      new URLSearchParams('view=history&query=mimoza&role=admin,staff&tenantId=tenant_ks')
    );

    render(
      <AdminSidebar
        user={{
          capabilities: { canAccessUsers: true, canReadAnalytics: true },
          name: 'Admin',
          email: 'admin@test.com',
          role: 'admin',
        }}
      />
    );

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/admin/overview?tenantId=tenant_ks'
    );
    expect(screen.getByRole('link', { name: 'Claims' })).toHaveAttribute(
      'href',
      '/admin/claims?tenantId=tenant_ks'
    );
    expect(screen.getByRole('link', { name: 'Payment Verification' })).toHaveAttribute(
      'href',
      '/admin/leads?tenantId=tenant_ks'
    );
    expect(screen.getByRole('link', { name: 'CRM Reporting' })).toHaveAttribute(
      'href',
      '/admin/crm?tenantId=tenant_ks'
    );
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('data-prefetch', 'true');
    expect(screen.getByRole('link', { name: 'Agents' })).toHaveAttribute('data-prefetch', 'true');
    for (const name of ['Staff', 'Claims', 'Dashboard', 'Payment Verification']) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute('data-prefetch');
    }
    expect(screen.getByRole('link', { name: 'Staff' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Agents' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Members' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Staff' })).toHaveAttribute(
      'href',
      '/admin/users?tenantId=tenant_ks&role=admin%2Cstaff'
    );
  });
});

describe('AdminRoleShell adapter', () => {
  it.each(['staff', 'agent'])(
    'passes effective %s admin capabilities into drawer navigation',
    role => {
      hoisted.shellProps.length = 0;
      render(
        <AdminRoleShell
          user={{
            role,
            name: 'Granted User',
            email: 'granted@example.com',
            capabilities: { canAccessUsers: true, canReadAnalytics: true },
          }}
          tenantSelector={null}
        >
          Page content
        </AdminRoleShell>
      );
      const paths = hoisted.shellProps.at(-1)!.items.map(item => item.href.split('?')[0]);
      expect(paths.filter(path => path === '/admin/users')).toHaveLength(3);
      expect(paths).toContain('/admin/analytics');
      expect(paths).not.toContain('/admin/settings');
    }
  );

  it.each(['admin', 'tenant_admin', 'super_admin', 'branch_manager'])(
    'keeps %s navigation decisions in a drawer with persistent title and account',
    role => {
      hoisted.searchParamsMock.mockReturnValue(
        new URLSearchParams('tenantId=tenant_ks&role=agent&search=private')
      );
      hoisted.shellProps.length = 0;
      render(
        <AdminRoleShell
          user={{
            capabilities: {
              canAccessUsers: role !== 'branch_manager',
              canReadAnalytics: role !== 'branch_manager',
            },
            role,
            branchId: null,
            name: 'Operator',
            email: 'operator@example.com',
          }}
          tenantSelector={null}
        >
          <p>Existing claim</p>
        </AdminRoleShell>
      );
      expect(screen.getByRole('heading', { name: 'Admin Panel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Operator/ })).toBeInTheDocument();
      expect(screen.getByText('Existing claim')).toBeInTheDocument();
      const props = hoisted.shellProps.at(-1)!;
      expect(props.mobileNavigation).toBe('drawer');
      expect(props.sidebarAccount).toBeTruthy();
      expect(props.items.every(item => !item.href.includes('search='))).toBe(true);
      expect(props.items.find(item => item.title === 'Agents')).toEqual(
        role === 'branch_manager' ? undefined : expect.objectContaining({ selected: true })
      );
      const paths = props.items.map(item => item.href.split('?')[0]);
      expect(paths.includes('/admin/branches')).toBe(role !== 'branch_manager');
      expect(paths.includes('/admin/crm')).toBe(role !== 'branch_manager');
      expect(paths.includes('/admin/sponsors')).toBe(role !== 'branch_manager');
      expect(paths).toContain('/admin/claims');
    }
  );
});
