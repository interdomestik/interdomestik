import { render } from '@testing-library/react';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import React from 'react';
import { vi } from 'vitest';
import HelpPage from './_core.entry';

const mocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
  };

  return {
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    createMemberSupportHandoff: vi.fn(),
    desc: vi.fn(column => ({ column, op: 'desc' })),
    eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
    getSessionSafe: vi.fn(),
    advisoryBanner: vi.fn(),
    publicResponseBanner: vi.fn(),
    redirect: vi.fn((href: string) => {
      throw new Error(`redirect:${href}`);
    }),
    requireSessionOrRedirect: vi.fn(session => session),
    select: vi.fn(() => selectChain),
    selectChain,
    searchParams: new URLSearchParams(),
    setRequestLocale: vi.fn(),
    useRouter: vi.fn(() => ({ push: vi.fn() })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ condition, scoped: true })),
  };
});
vi.mock('@/actions/support-handoffs/create', () => ({
  createMemberSupportHandoff: mocks.createMemberSupportHandoff,
}));
vi.mock('@/components/shell/session', () => ({
  getSessionSafe: mocks.getSessionSafe,
  requireSessionOrRedirect: mocks.requireSessionOrRedirect,
}));
vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: vi.fn(async () => ({
    session: { user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' } },
    authority: mintTestTenantAuthority('tenant-1'),
  })),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href?.toString()} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@interdomestik/database', () => {
  const db = {
    select: mocks.select,
  };
  return {
    and: mocks.and,
    claims: {
      claimNumber: 'claims.claim_number',
      createdAt: 'claims.created_at',
      id: 'claims.id',
      status: 'claims.status',
      tenantId: 'claims.tenant_id',
      title: 'claims.title',
      userId: 'claims.user_id',
    },
    db,
    withTenantContext: vi.fn(async (_context: unknown, callback: (tx: typeof db) => unknown) =>
      callback(db)
    ),
    desc: mocks.desc,
    eq: mocks.eq,
  };
});
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));
vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
  }) => (asChild ? <>{children}</> : <button {...props}>{children}</button>),
}));
vi.mock('@interdomestik/ui/components/card', () => ({
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <section {...props}>{children}</section>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props}>{children}</p>
  ),
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <header {...props}>{children}</header>
  ),
  CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
}));
vi.mock('./_advisory-banner', () => ({
  AdvisoryBanner: (props: {
    memberId: string;
    selectedClaim: { id: string } | null;
    authority: unknown;
  }) => {
    mocks.advisoryBanner(props);
    return (
      <div
        data-selected-claim={props.selectedClaim?.id ?? ''}
        data-testid="mock-member-support-handoff-advisory"
      />
    );
  },
}));
vi.mock('./_public-response-banner', () => ({
  PublicResponseBanner: (props: {
    handoffId?: string | null;
    locale: string;
    memberId: string;
    selectedClaim: { id: string } | null;
    authority: unknown;
  }) => {
    mocks.publicResponseBanner(props);
    return (
      <div
        data-handoff-id={props.handoffId ?? ''}
        data-selected-claim={props.selectedClaim?.id ?? ''}
        data-testid="mock-member-support-handoff-public-response"
      />
    );
  },
}));
vi.mock('lucide-react', () => ({
  Mail: () => <span aria-hidden="true" />,
  MessageSquare: () => <span aria-hidden="true" />,
  Phone: () => <span aria-hidden="true" />,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: mocks.setRequestLocale,
}));
vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  useRouter: mocks.useRouter,
}));
async function renderPage(searchParams: Record<string, string> = {}) {
  mocks.searchParams = new URLSearchParams(searchParams);
  const tree = await HelpPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  });
  render(tree);
}

export { mocks, renderPage };
