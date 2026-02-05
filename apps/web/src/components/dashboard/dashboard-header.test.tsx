import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardHeader } from './dashboard-header';

// Mock UserNav component
vi.mock('./user-nav', () => ({
  UserNav: () => <div data-testid="user-nav-mock">User Nav</div>,
}));

// Mock NotificationBell
vi.mock('@/components/notifications', () => ({
  NotificationBell: () => <div data-testid="notification-bell-mock">Bell</div>,
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
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Input: (props: any) => <input {...props} />,
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
});
