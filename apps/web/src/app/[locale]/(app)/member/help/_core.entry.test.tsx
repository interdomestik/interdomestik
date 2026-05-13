import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href?.toString()} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@interdomestik/database', () => ({
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
  db: {
    select: mocks.select,
  },
  desc: mocks.desc,
  eq: mocks.eq,
}));

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
    tenantId: string;
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
    tenantId: string;
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

import HelpPage from './_core.entry';

async function renderPage(searchParams: Record<string, string> = {}) {
  mocks.searchParams = new URLSearchParams(searchParams);
  const tree = await HelpPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  });
  render(tree);
}

describe('member help support handoff form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionSafe.mockResolvedValue({
      user: {
        id: 'member-1',
        role: 'member',
        tenantId: 'tenant-1',
      },
    });
    mocks.requireSessionOrRedirect.mockImplementation(session => session);
    mocks.select.mockReturnValue(mocks.selectChain);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.selectChain.orderBy.mockReturnValue(mocks.selectChain);
    mocks.selectChain.limit.mockImplementation(async (limit: number) =>
      limit === 1
        ? []
        : [
            {
              claimNumber: 'CLM-1',
              createdAt: new Date('2026-05-01T00:00:00.000Z'),
              id: 'claim-1',
              status: 'submitted',
              title: 'Claim one',
            },
          ]
    );
  });

  it('renders a member-created support handoff form without ownership inputs', async () => {
    await renderPage();

    expect(screen.getByTestId('member-page-ready')).toBeVisible();
    expect(mocks.advisoryBanner).toHaveBeenCalledWith({
      memberId: 'member-1',
      selectedClaim: null,
      tenantId: 'tenant-1',
    });
    expect(mocks.publicResponseBanner).toHaveBeenCalledWith({
      handoffId: null,
      locale: 'en',
      memberId: 'member-1',
      selectedClaim: null,
      tenantId: 'tenant-1',
    });
    expect(screen.getByTestId('member-support-handoff-form')).toBeVisible();
    expect(screen.getByTestId('member-support-handoff-subject')).toHaveAttribute('name', 'subject');
    expect(screen.getByTestId('member-support-handoff-message')).toHaveAttribute('name', 'message');
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveTextContent('CLM-1');
    expect(document.querySelector('input[name="source"]')).toHaveValue('member_help');
    expect(screen.queryByDisplayValue('tenant-1')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('member-1')).not.toBeInTheDocument();
  });

  it('shows the created acknowledgement after server action redirect', async () => {
    await renderPage({ support: 'created' });

    expect(screen.getByTestId('member-support-handoff-created')).toBeVisible();
  });

  it('preselects and displays a valid claim from the claimId search param', async () => {
    await renderPage({ claimId: 'claim-1' });

    expect(screen.getByTestId('member-support-handoff-claim-context')).toBeVisible();
    expect(screen.getByTestId('member-support-handoff-claim-title')).toHaveTextContent('CLM-1');
    expect(screen.getByTestId('member-support-handoff-claim-status')).toHaveTextContent(
      'request.claimContextStatus'
    );
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveValue('claim-1');
  });

  it('places the public response and advisory after claim context without changing selected claim state', async () => {
    await renderPage({ claimId: 'claim-1' });

    const claimContext = screen.getByTestId('member-support-handoff-claim-context');
    const publicResponse = screen.getByTestId('mock-member-support-handoff-public-response');
    const advisory = screen.getByTestId('mock-member-support-handoff-advisory');
    const form = screen.getByTestId('member-support-handoff-form');

    expect(publicResponse).toHaveAttribute('data-selected-claim', 'claim-1');
    expect(advisory).toHaveAttribute('data-selected-claim', 'claim-1');
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveValue('claim-1');
    expect(
      claimContext.compareDocumentPosition(publicResponse) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      publicResponse.compareDocumentPosition(advisory) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(advisory.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('passes a targeted handoff id from the notification URL to the public response banner', async () => {
    await renderPage({ handoffId: 'handoff-1' });

    expect(screen.getByTestId('mock-member-support-handoff-public-response')).toHaveAttribute(
      'data-handoff-id',
      'handoff-1'
    );
    expect(mocks.publicResponseBanner).toHaveBeenCalledWith(
      expect.objectContaining({ handoffId: 'handoff-1' })
    );
  });

  it('passes through a claim-detail source hint from the search params', async () => {
    await renderPage({ claimId: 'claim-1', source: 'member_claim_detail' });

    expect(screen.getByTestId('member-support-handoff-claim')).toHaveValue('claim-1');
    expect(document.querySelector('input[name="source"]')).toHaveValue('member_claim_detail');
    expect(document.querySelector('input[name="sourceClaimId"]')).toHaveValue('claim-1');
  });

  it('includes and preselects a valid owned claim outside the initial claim options', async () => {
    mocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          claimNumber: 'CLM-1',
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          id: 'claim-1',
          status: 'submitted',
          title: 'Claim one',
        },
      ])
      .mockResolvedValueOnce([
        {
          claimNumber: 'CLM-OLD',
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          id: 'claim-old',
          status: 'accepted',
          title: 'Older claim',
        },
      ]);

    await renderPage({ claimId: 'claim-old' });

    expect(screen.getByTestId('member-support-handoff-claim-context')).toHaveTextContent('CLM-OLD');
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveValue('claim-old');
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveTextContent('CLM-OLD');
  });

  it('ignores an inaccessible claimId search param before submission', async () => {
    await renderPage({ claimId: 'claim-other-member', source: 'member_claim_detail' });

    expect(screen.queryByTestId('member-support-handoff-claim-context')).not.toBeInTheDocument();
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveValue('');
    expect(document.querySelector('input[name="source"]')).toHaveValue('member_help');
    expect(document.querySelector('input[name="sourceClaimId"]')).not.toBeInTheDocument();
  });

  it('redirects non-member sessions to their canonical portal before rendering the form', async () => {
    mocks.getSessionSafe.mockResolvedValue({
      user: {
        id: 'agent-1',
        role: 'agent',
        tenantId: 'tenant-1',
      },
    });

    await expect(renderPage()).rejects.toThrow('redirect:/en/agent');
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
