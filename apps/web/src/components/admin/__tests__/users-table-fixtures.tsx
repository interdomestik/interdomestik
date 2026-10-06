import { vi } from 'vitest';

const { selectCallbacks } = vi.hoisted(() => ({
  selectCallbacks: [] as Array<(value: string) => void>,
}));

// Mock router
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams(
      'tenantId=tenant_mk&search=john&role=agent&assignment=unassigned&sort=name&dir=asc&pageSize=50&page=2'
    ),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'headers.user': 'User',
      'headers.role': 'Role',
      'headers.identity_id': 'Member / Account ID',
      'headers.assigned_agent': 'Assigned Agent',
      'headers.joined': 'Joined',
      view_profile: 'View Profile',
      select_agent: 'Select Agent',
      unassigned: 'Company-owned',
      no_users: 'No users found',
      success_message: 'Agent updated successfully',
      message_alert: `${params?.count || 0} new message(s)`,
      tenant_classification_pending: 'Tenant review pending',
      'roles.user': 'Member',
      'roles.agent': 'Agent',
      'roles.admin': 'Admin',
      none: 'None',
      'errors.generic': 'An error occurred',
    };
    return translations[key] || key;
  },
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock action
vi.mock('@/actions/admin-users', () => ({
  updateUserAgent: vi.fn().mockResolvedValue({}),
}));

// Mock UI components
vi.mock('@interdomestik/ui/components/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: () => null,
}));

vi.mock('@interdomestik/ui/components/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({
    children,
    asChild: _asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <button {...props}>{children}</button>,
}));

vi.mock('@interdomestik/ui/components/select', () => ({
  Select: ({
    children,
    disabled,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    value?: string;
    onValueChange: (value: string) => void;
  }) => {
    selectCallbacks.push(onValueChange);
    return (
      <fieldset disabled={disabled} data-testid="assignment-select" data-value={value}>
        {children}
      </fieldset>
    );
  },
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock('@interdomestik/ui/components/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
}));

export const mockUsers = [
  {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'user',
    image: null,
    agentId: null,
    createdAt: new Date('2024-01-15'),
    unreadCount: 3,
    alertLink: '/admin/claims/claim-1?foo=bar',
    memberNumber: 'MEM-2026-000001',
    tenantClassificationPending: true,
  },
  {
    id: 'user-2',
    name: 'Jane Agent',
    email: 'jane@example.com',
    role: 'agent',
    image: null,
    agentId: null,
    createdAt: new Date('2024-01-10'),
    memberNumber: null,
  },
];

export const mockAgents = [
  { id: 'agent-1', name: 'Agent Smith' },
  { id: 'agent-2', name: 'Agent Johnson' },
];

export { selectCallbacks };
