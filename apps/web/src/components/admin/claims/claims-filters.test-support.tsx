import type { ComponentProps, PropsWithChildren } from 'react';
import { vi } from 'vitest';

const { useRouter, usePathname, useSearchParams } = vi.hoisted(() => ({
  useRouter: vi.fn<typeof import('next/navigation').useRouter>(),
  usePathname: vi.fn<typeof import('next/navigation').usePathname>(),
  useSearchParams: vi.fn<typeof import('next/navigation').useSearchParams>(),
}));
vi.mock('next/navigation', () => ({ useRouter, usePathname, useSearchParams }));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === 'common') {
      if (key === 'all') return 'All';
      if (key === 'search') return 'Search';
    }

    const adminClaimsKeys: Record<string, string> = {
      'sections.active': 'Active',
      'sections.draft': 'Draft',
      'sections.resolved': 'Closed',
      'filters.unassigned_only': 'Unassigned',
      'filters.assigned_to_me': 'Assigned to me',
      'filters.assignment_label': 'Assignment',
      'filters.origin_label': 'Origin',
      'filters.origin_all': 'All origins',
      'filters.origin_diaspora': 'Diaspora / Green Card',
      'filters.pending_filter': 'Updating filters...',
      'filters.pending_search': 'Updating search...',
    };

    return adminClaimsKeys[key] ?? key;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui', () => ({
  Button: ({
    children,
    asChild: _asChild,
    ...props
  }: PropsWithChildren<ComponentProps<'button'> & { asChild?: boolean }>) => (
    <button {...props}>{children}</button>
  ),
  Badge: ({ children, ...props }: PropsWithChildren<ComponentProps<'span'>>) => (
    <span {...props}>{children}</span>
  ),
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
  // GlassCard is just a div in test
}));
vi.mock('@/components/ui/glass-card', () => ({
  GlassCard: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

export { usePathname, useRouter, useSearchParams };
