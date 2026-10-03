import { render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardHeader } from './dashboard-header';

// Mock UserNav component
vi.mock('./user-nav', () => ({
  UserNav: () => <div data-testid="user-nav-mock">User Nav</div>,
}));

const notificationBellMock = vi.fn(
  (_props?: { prefetchNotifications?: boolean; subscriberId?: string | null }) => (
    <div data-testid="notification-bell-mock">Bell</div>
  )
);

// Mock NotificationBell
vi.mock('@/components/notifications', () => ({
  NotificationBell: (props: { prefetchNotifications?: boolean; subscriberId?: string | null }) =>
    notificationBellMock(props),
}));

// Mock PortalSurfaceIndicator
vi.mock('./portal-surface-indicator', () => ({
  PortalSurfaceIndicator: () => <div data-testid="portal-surface-indicator-mock">Indicator</div>,
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  SidebarTrigger: ({ className }: { className?: string }) => (
    <button data-testid="sidebar-trigger" className={className}>
      Toggle
    </button>
  ),
  Separator: () => <div data-testid="separator" />,
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

describe('DashboardHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the header correctly', () => {
    render(<DashboardHeader />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders sidebar trigger', () => {
    render(<DashboardHeader />);

    expect(screen.getByTestId('sidebar-trigger')).toBeInTheDocument();
  });

  it('renders separator', () => {
    render(<DashboardHeader />);

    expect(screen.getByTestId('separator')).toBeInTheDocument();
  });

  it('renders notification bell', () => {
    render(<DashboardHeader />);

    expect(screen.getByTestId('notification-bell-mock')).toBeInTheDocument();
  });

  it('defaults notification prefetch to lazy mode', () => {
    render(<DashboardHeader />);

    expect(notificationBellMock).toHaveBeenCalledWith(
      expect.objectContaining({ prefetchNotifications: false })
    );
  });

  it('renders user nav', () => {
    render(<DashboardHeader />);

    expect(screen.getByTestId('user-nav-mock')).toBeInTheDocument();
  });

  it('has proper styling classes', () => {
    render(<DashboardHeader />);

    const header = screen.getByRole('banner');
    expect(header).toHaveClass('h-16');
    expect(header).toHaveClass('border-b');
    expect(header).toHaveClass('sticky');
    expect(header).toHaveClass('top-0');
  });

  it('keeps every control and the notification identity in responsive compact density', () => {
    render(
      <DashboardHeader
        user={{ id: 'staff-1', role: 'staff', name: 'Staff One' }}
        adminAccess={false}
        density="responsive-compact"
      />
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-trigger')).toBeVisible();
    expect(screen.getByTestId('portal-surface-indicator-mock')).toBeVisible();
    expect(screen.getByTestId('notification-bell-mock')).toBeVisible();
    expect(screen.getByTestId('user-nav-mock')).toBeVisible();
    expect(notificationBellMock).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId: 'staff-1', prefetchNotifications: false })
    );
  });

  it('leaves the default (non opt-in) header contract untouched', () => {
    render(<DashboardHeader user={{ id: 'member-1', role: 'member' }} />);

    const header = screen.getByRole('banner');
    expect(header.dataset.density).toBeUndefined();
    expect(header).toHaveClass('h-16');
    expect(header).not.toHaveClass('flex-wrap');
    expect(screen.getByTestId('portal-surface-indicator-mock')).toBeVisible();
    expect(screen.getByTestId('notification-bell-mock')).toBeVisible();
    expect(screen.getByTestId('user-nav-mock')).toBeVisible();
    expect(notificationBellMock).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId: 'member-1', prefetchNotifications: false })
    );
  });
});
