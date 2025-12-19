import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminSidebar } from './admin-sidebar';

// Mock next-intl hooks
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock routing
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  usePathname: () => '/en/admin',
}));

describe('AdminSidebar', () => {
  it('renders user information', () => {
    render(
      <AdminSidebar
        user={{
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
        }}
      />
    );

    expect(screen.getByText('Admin User')).toBeDefined();
    expect(screen.getByText('admin')).toBeDefined();
  });

  it('renders navigation links', () => {
    render(
      <AdminSidebar
        user={{
          name: 'Admin',
          email: 'admin@test.com',
          role: 'admin',
        }}
      />
    );

    // We mocked translation to return key, so we look for keys like 'nav.dashboard'
    // But in the component it uses `t('dashboard')` -> so we expect 'dashboard'
    expect(screen.getByText('dashboard')).toBeDefined();
    expect(screen.getByText('claims')).toBeDefined();
  });
});
